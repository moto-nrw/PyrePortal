import {
  api,
  getNetworkErrorMessage,
  mapServerErrorToGerman,
  isNetworkRelatedError,
  type ActivityResponse,
  type Room,
  type CurrentSession,
  type DailyFeedbackRating,
} from '../../services/api';
import {
  createRecreationRequestTracker,
  recreateSession as requestSessionRecreation,
  type SessionRecreationOutcome,
} from '../../services/sessionService';
import {
  type SessionSettings,
  saveSessionSettings,
  loadSessionSettings,
  clearLastSession,
} from '../../services/sessionStorage';
import { createLogger } from '../../utils/logger';
import type { GetState, SetState, UserState } from '../userStore';

import type { User } from './authSlice';
import { RFID_SESSION_INITIAL_STATE } from './scanSlice';

// Create a store-specific logger instance
const storeLogger = createLogger('UserStore');

/**
 * Helper to create activity summary for logging (reduces nesting depth)
 */
const toActivitySummary = (a: ActivityResponse) => ({
  id: a.id,
  name: a.name,
  category: a.category_name,
});

const mapSessionValidationError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : 'Validierung fehlgeschlagen';

  if (isNetworkRelatedError(error)) {
    return getNetworkErrorMessage('sessionValidation');
  }

  switch (rawMessage) {
    case 'Gespeicherte Aktivität nicht mehr verfügbar':
      return 'Die gespeicherte Aktivität wurde gelöscht oder ist nicht mehr verfügbar. Bitte wählen Sie eine neue Aktivität aus.';
    case 'Gespeicherter Raum nicht verfügbar':
      return 'Der gespeicherte Raum ist nicht mehr verfügbar. Bitte wählen Sie einen anderen Raum.';
    case 'Fehler beim Laden der Betreuer':
      return 'Die Betreuer konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
    case 'Keine gültigen Betreuer gefunden':
      return 'Die gespeicherten Betreuer sind nicht mehr gültig. Bitte wählen Sie das Team erneut aus.';
    case 'Validierung fehlgeschlagen':
      return 'Die gespeicherte Sitzung ist nicht mehr gültig. Bitte erstellen Sie sie erneut.';
    default:
      return mapServerErrorToGerman(rawMessage);
  }
};

/**
 * Creates a fallback activity object when full data is unavailable.
 * Used during session restoration when the activity API call fails or returns no match.
 */
const createFallbackActivity = (
  session: CurrentSession,
  supervisorName: string
): ActivityResponse => ({
  id: session.activity_id,
  name: session.activity_name ?? '',
  category: '',
  category_name: '',
  category_color: '',
  room_name: session.room_name ?? '',
  enrollment_count: 0,
  max_participants: 0,
  has_spots: true,
  supervisor_name: supervisorName,
  is_active: session.is_active ?? true,
});

/**
 * Fetches activity data from API during session restoration.
 * Returns the matching activity or a fallback if not found.
 */
const fetchActivityForSession = async (
  session: CurrentSession,
  pin: string,
  supervisorName: string
): Promise<ActivityResponse> => {
  try {
    storeLogger.debug('Fetching activities to restore complete session activity data', {
      activityId: session.activity_id,
    });

    const activities = await api.getActivities(pin);
    const matchingActivity = activities.find(activity => activity.id === session.activity_id);

    if (matchingActivity) {
      storeLogger.info('Session activity restored from API with complete data', {
        activityId: session.activity_id,
        maxParticipants: matchingActivity.max_participants,
        enrollmentCount: matchingActivity.enrollment_count,
      });
      return matchingActivity;
    }

    storeLogger.warn(
      'Activity not found in API response during session restoration, using fallback with limited data',
      {
        activityId: session.activity_id,
        availableActivityIds: activities.map(a => a.id),
      }
    );
    return createFallbackActivity(session, supervisorName);
  } catch (error) {
    storeLogger.error('Failed to fetch activities during session restoration, using fallback', {
      error: error instanceof Error ? error.message : 'Unknown error',
      activityId: session.activity_id,
    });
    return createFallbackActivity(session, supervisorName);
  }
};

/**
 * Resolves activity data for session restoration.
 * Uses cached data if available, otherwise fetches from API.
 */
const resolveSessionActivity = async (
  session: CurrentSession,
  currentSelectedActivity: ActivityResponse | null,
  pin: string,
  supervisorName: string
): Promise<ActivityResponse | null> => {
  if (!session.activity_name) {
    return null;
  }

  // If we already have a selectedActivity with the same ID, preserve its data
  if (currentSelectedActivity?.id === session.activity_id) {
    return currentSelectedActivity;
  }

  return fetchActivityForSession(session, pin, supervisorName);
};

/**
 * Creates room object from session data if available.
 */
const createSessionRoom = (session: CurrentSession): Room | null => {
  if (!session.room_id || !session.room_name) {
    return null;
  }

  return {
    id: session.room_id,
    name: session.room_name,
    is_occupied: true, // Current session room is always occupied
  };
};

/**
 * Validates and resolves supervisors from saved session data.
 * Loads users if not already loaded, then maps supervisor IDs to User objects.
 */
const resolveSupervisorsForSession = async (
  supervisorIds: number[],
  currentUsers: User[],
  fetchTeachers: () => Promise<void>,
  getUpdatedUsers: () => User[]
): Promise<User[]> => {
  let usersToSearch = currentUsers;

  // Load users if not already loaded
  if (usersToSearch.length === 0) {
    storeLogger.debug('Loading teachers to validate supervisors');
    await fetchTeachers();
    usersToSearch = getUpdatedUsers();

    if (usersToSearch.length === 0) {
      throw new Error('Fehler beim Laden der Betreuer');
    }
  }

  // Map supervisor IDs to User objects
  const supervisors = supervisorIds
    .map(id => usersToSearch.find(u => u.id === id))
    .filter((u): u is User => u !== undefined);

  if (supervisors.length === 0) {
    storeLogger.warn('No valid supervisors found', {
      savedIds: supervisorIds,
      availableUsers: usersToSearch.map(u => u.id),
    });
    throw new Error('Keine gültigen Betreuer gefunden');
  }

  return supervisors;
};

// Session-scoped state that should be cleared when session ends
// This prevents stale room/activity data from being used after session change
// NOTE: selectedSupervisors is NOT included here - supervisors persist independently
// for Tag Assignment feature (team selection without active session). Supervisors are
// cleared explicitly in logout() and when a session ends via endSession().
const SESSION_INITIAL_STATE = {
  selectedRoom: null as Room | null,
  selectedActivity: null as ActivityResponse | null,
  currentSession: null as CurrentSession | null,
  activeSupervisorTags: new Set<string>(),
};

export const createSessionSlice = (set: SetState<UserState>, get: GetState<UserState>) => {
  // Race guard for session recreation: stale async responses are discarded
  const recreationTracker = createRecreationRequestTracker();

  return {
    // Initial state
    selectedActivity: null,
    currentSession: null,
    selectedSupervisors: [] as User[], // New state for multi-supervisor selection

    // Session settings initial state
    sessionSettings: null,
    isValidatingLastSession: false,

    setSelectedActivity: (activity: ActivityResponse) => set({ selectedActivity: activity }),

    setCurrentSession: (session: CurrentSession) => set({ currentSession: session }),

    // Invalidate all in-flight recreation requests (e.g. on logout)
    invalidateSessionRecreation: () => {
      recreationTracker.invalidate();
    },

    // Recreate the last saved session from the validated selection in the store.
    // The request-id guard marks responses as stale when a newer attempt or an
    // invalidation (logout) happened while the request was in flight.
    recreateSession: async (): Promise<SessionRecreationOutcome> => {
      const requestId = recreationTracker.begin();
      const { authenticatedUser, selectedActivity, selectedRoom, selectedSupervisors } = get();

      if (
        !authenticatedUser?.pin ||
        !selectedActivity ||
        !selectedRoom ||
        selectedSupervisors.length === 0
      ) {
        return { status: 'incomplete', stale: !recreationTracker.isCurrent(requestId) };
      }

      storeLogger.info('Confirming session recreation', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
        supervisorCount: selectedSupervisors.length,
      });

      const result = await requestSessionRecreation({
        pin: authenticatedUser.pin,
        activity: selectedActivity,
        room: selectedRoom,
        supervisorIds: selectedSupervisors.map(s => s.id),
      });

      if (result.status === 'error') {
        return {
          status: 'error',
          error: result.error,
          stale: !recreationTracker.isCurrent(requestId),
        };
      }

      storeLogger.info('Session recreated successfully', {
        sessionId: result.session.active_group_id,
      });

      // Success is applied unconditionally (historical behavior): the session
      // state is set even when the response is stale; only UI reactions are
      // guarded by the caller.
      set({ currentSession: result.session });
      await get().saveLastSessionData();

      return {
        status: 'success',
        session: result.session,
        stale: !recreationTracker.isCurrent(requestId),
      };
    },

    fetchCurrentSession: async () => {
      const { authenticatedUser } = get();

      if (!authenticatedUser?.pin) {
        storeLogger.warn('Cannot fetch current session: no authenticated user or PIN');
        return;
      }

      try {
        storeLogger.info('Fetching current session for device');
        const session = await api.getCurrentSession(authenticatedUser.pin);

        if (!session) {
          storeLogger.debug('No active session found for device, clearing session state');
          get().clearSessionState();
          return;
        }

        storeLogger.info('Active session found', {
          activeGroupId: session.active_group_id,
          activityId: session.activity_id,
          activityName: session.activity_name,
          roomName: session.room_name,
          startTime: session.start_time,
          duration: session.duration,
        });

        // Resolve activity and room data using extracted helpers
        const currentSelectedActivity = get().selectedActivity;
        const sessionActivity = await resolveSessionActivity(
          session,
          currentSelectedActivity,
          authenticatedUser.pin,
          authenticatedUser.staffName
        );
        const sessionRoom = createSessionRoom(session);

        // Guard: Don't overwrite selectedRoom if user just manually selected a room
        // This prevents stale server data from reverting a recent room switch.
        // A null sessionRoom during the recent-selection window is treated as stale/partial
        // data — the manual selection is preserved rather than wiped.
        const currentSelectedRoom = get().selectedRoom;
        const roomSelectedAt = get()._roomSelectedAt;
        const isRecentManualSelection =
          roomSelectedAt != null && Date.now() - roomSelectedAt < 5000;
        const shouldPreserveRoom =
          isRecentManualSelection &&
          currentSelectedRoom != null &&
          currentSelectedRoom.id !== sessionRoom?.id;

        if (shouldPreserveRoom) {
          storeLogger.debug('Preserving manually selected room during fetchCurrentSession', {
            manualRoomId: currentSelectedRoom.id,
            manualRoomName: currentSelectedRoom.name,
            serverRoomId: sessionRoom?.id ?? null,
            serverRoomName: sessionRoom?.name ?? null,
            roomSelectedAgoMs: Date.now() - roomSelectedAt,
          });
        }

        set({
          currentSession: session,
          selectedActivity: sessionActivity,
          ...(shouldPreserveRoom ? {} : { selectedRoom: sessionRoom }),
          // Sync supervisors from backend → local cache
          ...(session.supervisors && {
            selectedSupervisors: session.supervisors.map(sup => ({
              id: sup.staff_id,
              name: sup.display_name,
            })),
          }),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        storeLogger.error('Failed to fetch current session', { error: errorMessage });
        // Don't set error state for session check, just log it
      }
    },

    // Load the supervisors of the active session from the backend into the
    // local supervisor selection. Errors propagate to the caller on purpose
    // (pages log them in their own initialization error handling).
    loadSessionSupervisors: async (): Promise<void> => {
      const { authenticatedUser } = get();

      if (!authenticatedUser?.pin) {
        storeLogger.warn('Cannot load session supervisors: no authenticated user or PIN');
        return;
      }

      const sessionDetails = await api.getCurrentSession(authenticatedUser.pin);
      if (sessionDetails && 'supervisors' in sessionDetails) {
        const currentSupervisors =
          sessionDetails.supervisors?.map(sup => ({
            id: sup.staff_id,
            name: sup.display_name,
          })) ?? [];
        get().setSelectedSupervisors(currentSupervisors);
      }
    },

    // Supervisor selection actions
    setSelectedSupervisors: (supervisors: User[]) =>
      set({ selectedSupervisors: supervisors, activeSupervisorTags: new Set<string>() }),

    toggleSupervisor: (user: User) => {
      const { selectedSupervisors } = get();
      const isSelected = selectedSupervisors.some(s => s.id === user.id);

      if (isSelected) {
        // Remove supervisor
        set({
          selectedSupervisors: selectedSupervisors.filter(s => s.id !== user.id),
          activeSupervisorTags: new Set<string>(),
        });
      } else {
        // Add supervisor
        set({
          selectedSupervisors: [...selectedSupervisors, user],
          activeSupervisorTags: new Set<string>(),
        });
      }
    },

    // Activity-related actions
    fetchActivities: (() => {
      let fetchPromise: Promise<ActivityResponse[] | null> | null = null;

      return async (): Promise<ActivityResponse[] | null> => {
        // Return existing promise if already fetching
        if (fetchPromise) {
          storeLogger.debug('Activities fetch already in progress, returning existing promise');
          return fetchPromise;
        }

        const { authenticatedUser } = get();
        set({ isLoading: true, error: null });

        if (!authenticatedUser) {
          const errorMsg = 'Keine Authentifizierung für das Laden von Aktivitäten';
          set({
            error: mapServerErrorToGerman(errorMsg),
            isLoading: false,
          });
          return null;
        }

        if (!authenticatedUser.pin) {
          const errorMsg = 'PIN nicht verfügbar. Bitte loggen Sie sich erneut ein.';
          set({
            error: mapServerErrorToGerman(errorMsg),
            isLoading: false,
          });
          return null;
        }

        // Create new fetch promise
        fetchPromise = (async () => {
          try {
            storeLogger.info('Fetching activities from API', {
              staffId: authenticatedUser.staffId,
              staffName: authenticatedUser.staffName,
            });

            const activitiesData = await api.getActivities(authenticatedUser.pin);

            storeLogger.info('Activities loaded successfully', {
              count: activitiesData.length,
              activities: activitiesData.map(toActivitySummary),
            });

            set({ isLoading: false });
            return activitiesData;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            storeLogger.error('Failed to fetch activities', {
              error: errorMessage,
              staffId: authenticatedUser.staffId,
            });

            set({
              error: mapServerErrorToGerman(errorMessage),
              isLoading: false,
            });

            return null;
          } finally {
            // Clear the promise when done
            fetchPromise = null;
          }
        })();

        return fetchPromise;
      };
    })(),

    // Session settings actions
    loadSessionSettings: async () => {
      try {
        storeLogger.debug('Loading session settings');
        const settings = await loadSessionSettings();

        if (settings) {
          set({ sessionSettings: settings });
          storeLogger.info('Session settings loaded', {
            useLastSession: settings.use_last_session,
            hasLastSession: !!settings.last_session,
          });
        }
      } catch (error) {
        storeLogger.error('Failed to load session settings', { error });
      }
    },

    toggleUseLastSession: async (enabled: boolean) => {
      const { sessionSettings } = get();

      const newSettings: SessionSettings = {
        use_last_session: enabled,
        auto_save_enabled: true,
        last_session: sessionSettings?.last_session ?? null,
      };

      try {
        await saveSessionSettings(newSettings);
        set({ sessionSettings: newSettings });
        storeLogger.info('Toggle use last session', { enabled });
      } catch (error) {
        storeLogger.error('Failed to save session settings', { error });
      }
    },

    saveLastSessionData: async () => {
      const { selectedActivity, selectedRoom, selectedSupervisors, sessionSettings } = get();

      if (!selectedActivity || !selectedRoom || selectedSupervisors.length === 0) {
        storeLogger.warn('Cannot save session data: missing required fields');
        return;
      }

      const lastSessionConfig = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id,
        supervisor_ids: selectedSupervisors.map(s => s.id),
        saved_at: new Date().toISOString(),
        activity_name: selectedActivity.name,
        room_name: selectedRoom.name,
        supervisor_names: selectedSupervisors.map(s => s.name),
      };

      const newSettings: SessionSettings = {
        use_last_session: sessionSettings?.use_last_session ?? false,
        auto_save_enabled: true,
        last_session: lastSessionConfig,
      };

      try {
        await saveSessionSettings(newSettings);
        set({ sessionSettings: newSettings });
        storeLogger.info('Last session data saved', {
          activityId: selectedActivity.id,
          roomId: selectedRoom.id,
          supervisorCount: selectedSupervisors.length,
        });
      } catch (error) {
        storeLogger.error('Failed to save last session data', { error });
      }
    },

    validateAndRecreateSession: async () => {
      const { sessionSettings, authenticatedUser } = get();

      if (!sessionSettings?.last_session || !authenticatedUser?.pin) {
        storeLogger.warn('Cannot recreate session: no saved session or authentication');
        return false;
      }

      set({ isValidatingLastSession: true, error: null });

      try {
        // Validate activity exists
        const activities = await api.getActivities(authenticatedUser.pin);
        const activity = activities.find(a => a.id === sessionSettings.last_session!.activity_id);

        if (!activity) {
          throw new Error('Gespeicherte Aktivität nicht mehr verfügbar');
        }

        // Validate room is available
        const rooms = await api.getRooms(authenticatedUser.pin);
        const room = rooms.find(r => r.id === sessionSettings.last_session!.room_id);

        if (!room) {
          throw new Error('Gespeicherter Raum nicht verfügbar');
        }

        // Resolve supervisors - use current if already selected, otherwise validate saved ones
        const { selectedSupervisors, users } = get();
        const supervisors =
          selectedSupervisors.length > 0
            ? selectedSupervisors
            : await resolveSupervisorsForSession(
                sessionSettings.last_session.supervisor_ids,
                users,
                get().fetchTeachers,
                () => get().users
              );

        // Set validated data in store
        set({
          selectedActivity: activity,
          selectedRoom: room,
          selectedSupervisors: supervisors,
          activeSupervisorTags: new Set<string>(),
          isValidatingLastSession: false,
        });

        storeLogger.info('Session validation successful', {
          activityId: activity.id,
          roomId: room.id,
          supervisorCount: supervisors.length,
        });

        return true;
      } catch (error) {
        const userMessage = mapSessionValidationError(error);
        storeLogger.error('Session validation failed', {
          error: userMessage,
          rawError: error instanceof Error ? error.message : error,
        });

        // Clear invalid session data
        await clearLastSession();
        set({
          sessionSettings: sessionSettings
            ? { ...sessionSettings, last_session: null, use_last_session: false }
            : null,
          isValidatingLastSession: false,
          error: userMessage,
        });

        return false;
      }
    },

    // Submit daily feedback
    submitDailyFeedback: async (
      studentId: number,
      rating: DailyFeedbackRating
    ): Promise<boolean> => {
      const { authenticatedUser } = get();

      if (!authenticatedUser?.pin) {
        storeLogger.error('Cannot submit feedback: no authenticated user');
        return false;
      }

      try {
        storeLogger.info('Submitting daily feedback', {
          studentId,
          rating,
        });

        await api.submitDailyFeedback(authenticatedUser.pin, {
          student_id: studentId,
          value: rating,
        });

        storeLogger.info('Daily feedback submitted successfully', {
          studentId,
          rating,
        });

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        storeLogger.error('Failed to submit daily feedback', { error: errorMessage });
        return false;
      }
    },

    // Clear all session-scoped state when session ends
    // This prevents stale room/activity data from causing issues (Issue #129 Bug 1)
    clearSessionState: () => {
      storeLogger.info('Clearing session-scoped state');
      set(state => ({
        ...SESSION_INITIAL_STATE,
        rfid: {
          ...state.rfid,
          ...RFID_SESSION_INITIAL_STATE,
        },
      }));
    },
  };
};
