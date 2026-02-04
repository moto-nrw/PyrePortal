import { create } from 'zustand';

import type { NetworkStatusData } from '../components/ui/NetworkStatus';
import {
  api,
  mapServerErrorToGerman,
  isNetworkRelatedError,
  type Teacher,
  type ActivityResponse,
  type Room,
  type CurrentSession,
  type RfidScanResult,
  type DailyFeedbackRating,
} from '../services/api';
import {
  type SessionSettings,
  saveSessionSettings,
  loadSessionSettings,
  clearLastSession,
} from '../services/sessionStorage';
import { getSecureRandomInt } from '../utils/crypto';
import { createLogger, LogLevel } from '../utils/logger';
import { loggerMiddleware } from '../utils/storeMiddleware';

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

// Re-export isNetworkRelatedError for backward compatibility
export { isNetworkRelatedError } from '../services/api';

const mapSessionValidationError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : 'Validierung fehlgeschlagen';

  if (isNetworkRelatedError(error)) {
    return 'Netzwerkfehler bei der Überprüfung der gespeicherten Sitzung. Bitte Verbindung prüfen und erneut versuchen.';
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
 * Error types for activity check-in/check-out operations
 */
type ActivityErrorType =
  | 'activity_not_found'
  | 'student_already_checked_in'
  | 'no_students_checked_in'
  | 'student_not_checked_in'
  | 'checkin_failed'
  | 'checkout_failed';

interface ActivityErrorContext {
  activityName?: string;
  studentName?: string;
  activityId?: number;
  studentId?: number;
}

/**
 * Builds network error message for check-in/check-out failures
 */
const buildNetworkErrorMessage = (
  errorType: 'checkin_failed' | 'checkout_failed',
  studentName?: string
): string => {
  const action = errorType === 'checkin_failed' ? 'Einchecken' : 'Auschecken';
  const name = studentName ? ` von ${studentName}` : '';
  return `Netzwerkfehler beim ${action}${name}. Bitte Verbindung prüfen und erneut scannen.`;
};

/**
 * Error message handlers for each activity error type (reduces switch complexity)
 */
const activityErrorMessages: Record<ActivityErrorType, (context: ActivityErrorContext) => string> =
  {
    activity_not_found: ({ activityName, activityId }) =>
      activityName
        ? `Aktivität '${activityName}' nicht gefunden. Bitte Seite neu laden.`
        : `Aktivität (ID: ${activityId}) nicht gefunden. Bitte Seite neu laden.`,

    student_already_checked_in: ({ studentName, activityName }) =>
      studentName && activityName
        ? `${studentName} ist bereits in '${activityName}' eingecheckt.`
        : 'Schüler/in ist bereits eingecheckt.',

    no_students_checked_in: ({ activityName }) =>
      activityName
        ? `In '${activityName}' sind keine Schüler/innen eingecheckt.`
        : 'Keine Schüler/innen eingecheckt.',

    student_not_checked_in: ({ studentName, activityName }) => {
      if (studentName && activityName) {
        return `${studentName} ist in '${activityName}' nicht eingecheckt.`;
      }
      return activityName
        ? `Schüler/in ist in '${activityName}' nicht eingecheckt.`
        : 'Schüler/in ist nicht eingecheckt.';
    },

    checkin_failed: ({ studentName }) =>
      studentName ? `Fehler beim Einchecken von ${studentName}.` : 'Fehler beim Einchecken.',

    checkout_failed: ({ studentName }) =>
      studentName ? `Fehler beim Auschecken von ${studentName}.` : 'Fehler beim Auschecken.',
  };

/**
 * Handles network-related errors for check-in/check-out operations.
 * Returns error message if network error, null otherwise.
 */
const handleCheckinCheckoutNetworkError = (
  errorType: ActivityErrorType,
  context: ActivityErrorContext,
  originalError?: unknown
): string | null => {
  if (errorType !== 'checkin_failed' && errorType !== 'checkout_failed') {
    return null;
  }

  if (isNetworkRelatedError(originalError)) {
    return buildNetworkErrorMessage(errorType, context.studentName);
  }

  const rawMessage = originalError instanceof Error ? originalError.message : '';
  if (rawMessage) {
    return mapServerErrorToGerman(rawMessage);
  }

  return null;
};

/**
 * Maps activity-related errors to user-friendly German messages with context
 */
const mapActivityError = (
  errorType: ActivityErrorType,
  context: ActivityErrorContext = {},
  originalError?: unknown
): string => {
  // Handle network errors for checkin/checkout first
  const networkError = handleCheckinCheckoutNetworkError(errorType, context, originalError);
  if (networkError) {
    return networkError;
  }

  // Use message handler lookup instead of switch
  const messageHandler = activityErrorMessages[errorType];
  if (messageHandler) {
    return messageHandler(context);
  }

  return 'Ein unbekannter Fehler ist aufgetreten.';
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
  if (currentSelectedActivity && currentSelectedActivity.id === session.activity_id) {
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

// Define the ActivityCategory enum
enum ActivityCategory {
  SPORT = 'Sport',
  SCIENCE = 'Wissenschaft',
  ART = 'Kunst',
  MUSIC = 'Musik',
  LITERATURE = 'Literatur',
  GAMES = 'Spiele',
  OTHER = 'Sonstiges',
}

// Define the Activity interface
interface Activity {
  id: number;
  name: string;
  category: ActivityCategory;
  roomId: number;
  supervisorId: number;
  maxParticipants?: number;
  createdBy: string;
  createdAt: Date;
  checkedInStudents?: Student[];
}

interface Student {
  id: number;
  name: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  isCheckedIn: boolean;
}

// Room interface imported from API service

// Define the User interface
interface User {
  id: number;
  name: string;
}

// Transform Teacher to User interface
function teacherToUser(teacher: Teacher): User {
  return {
    id: teacher.staff_id,
    name: teacher.display_name,
  };
}

// Authenticated user context
interface AuthenticatedUser {
  staffId: number;
  staffName: string;
  deviceName: string;
  authenticatedAt: Date;
  pin: string; // Store PIN for subsequent API calls
}

// Optimistic scan state for immediate UI feedback
interface OptimisticScanState {
  id: string;
  tagId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  optimisticAction: 'checkin' | 'checkout';
  optimisticStudentCount: number;
  timestamp: number;
  studentInfo?: {
    name: string;
    id: number;
  };
}

// Student action history for smart duplicate prevention
interface StudentActionHistory {
  studentId: string;
  lastAction: 'checkin' | 'checkout';
  timestamp: number;
  isProcessing: boolean;
}

// Recent tag scan tracking
interface RecentTagScan {
  timestamp: number;
  studentId?: string;
  result?: RfidScanResult;
  syncPromise?: Promise<void>; // Background sync promise (for race condition prevention)
}

// RFID scanning state
interface RfidState {
  isScanning: boolean;
  currentScan: RfidScanResult | null;
  blockedTags: Map<string, number>; // tagId -> blockUntilTimestamp
  scanTimeout: number; // 3 seconds default
  modalDisplayTime: number; // 1.25 seconds default
  showModal: boolean;

  // New optimistic state management
  optimisticScans: OptimisticScanState[];
  studentHistory: Map<string, StudentActionHistory>;
  processingQueue: Set<string>; // Currently processing tag IDs

  // New additions for proper duplicate prevention
  recentTagScans: Map<string, RecentTagScan>; // Track recent scans by tagId
  tagToStudentMap: Map<string, string>; // Cache tagId -> studentId mappings
}

// Define the store state interface
interface UserState {
  // State
  users: User[];
  selectedUser: string;
  selectedUserId: number | null;
  authenticatedUser: AuthenticatedUser | null;
  rooms: Room[];
  selectedRoom: Room | null;
  _roomSelectedAt: number | null; // Timestamp of last manual room selection (race condition guard)
  selectedActivity: ActivityResponse | null;
  currentSession: CurrentSession | null;
  activities: Activity[];
  currentActivity: Partial<Activity> | null;
  isLoading: boolean;
  error: string | null;
  nfcScanActive: boolean;
  selectedSupervisors: User[]; // Selected supervisors for multi-supervisor sessions
  activeSupervisorTags: Set<string>; // Locally tracked supervisor tagIds for instant re-entry

  // RFID scanning state
  rfid: RfidState;

  // Session settings state
  sessionSettings: SessionSettings | null;
  isValidatingLastSession: boolean;

  // Network status state
  networkStatus: NetworkStatusData;

  // Actions
  setSelectedUser: (userName: string, userId: number | null) => void;
  setAuthenticatedUser: (userData: {
    staffId: number;
    staffName: string;
    deviceName: string;
    pin: string;
  }) => void;
  setSelectedActivity: (activity: ActivityResponse) => void;
  fetchTeachers: (forceRefresh?: boolean) => Promise<void>;
  fetchRooms: () => Promise<void>;
  selectRoom: (roomId: number) => void;
  fetchCurrentSession: () => Promise<void>;
  logout: () => Promise<void>;

  // Activity-related actions
  initializeActivity: (roomId: number) => void;
  updateActivityField: <K extends keyof Activity>(field: K, value: Activity[K]) => void;
  createActivity: () => Promise<boolean>;
  fetchActivities: () => Promise<ActivityResponse[] | null>;
  cancelActivityCreation: () => void;

  // Supervisor selection actions
  setSelectedSupervisors: (supervisors: User[]) => void;
  toggleSupervisor: (user: User) => void;
  clearSelectedSupervisors: () => void;
  addSupervisorFromRfid: (staffId: number, staffName: string) => boolean;
  addActiveSupervisorTag: (tagId: string) => void;
  isActiveSupervisor: (tagId: string) => boolean;
  clearActiveSupervisorTags: () => void;

  // Check-in/check-out actions
  startNfcScan: () => void;
  stopNfcScan: () => void;
  checkInStudent: (
    activityId: number,
    student: Omit<Student, 'checkInTime' | 'isCheckedIn'>
  ) => Promise<boolean>;
  checkOutStudent: (activityId: number, studentId: number) => Promise<boolean>;
  getActivityStudents: (activityId: number) => Student[];

  // RFID actions
  startRfidScanning: () => void;
  stopRfidScanning: () => void;
  setScanResult: (result: RfidScanResult | null) => void;
  blockTag: (tagId: string, duration: number) => void;
  isTagBlocked: (tagId: string) => boolean;
  clearBlockedTag: (tagId: string) => void;
  showScanModal: () => void;
  hideScanModal: () => void;

  // New optimistic RFID actions
  addOptimisticScan: (scan: OptimisticScanState) => void;
  updateOptimisticScan: (id: string, status: OptimisticScanState['status']) => void;
  removeOptimisticScan: (id: string) => void;
  updateStudentHistory: (studentId: string, action: 'checkin' | 'checkout') => void;
  isValidScan: (studentId: string, action: 'checkin' | 'checkout') => boolean;
  addToProcessingQueue: (tagId: string) => void;
  removeFromProcessingQueue: (tagId: string) => void;

  // Enhanced duplicate prevention actions
  canProcessTag: (tagId: string) => boolean;
  recordTagScan: (tagId: string, scan: RecentTagScan) => void;
  clearTagScan: (tagId: string) => void;
  mapTagToStudent: (tagId: string, studentId: string) => void;
  getCachedStudentId: (tagId: string) => string | undefined;
  clearOldTagScans: () => void;
  isValidStudentScan: (studentId: string, action: 'checkin' | 'checkout') => boolean;

  // Session settings actions
  loadSessionSettings: () => Promise<void>;
  toggleUseLastSession: (enabled: boolean) => Promise<void>;
  saveLastSessionData: () => Promise<void>;
  validateAndRecreateSession: () => Promise<boolean>;
  clearSessionSettings: () => Promise<void>;

  // Network status actions
  setNetworkStatus: (status: NetworkStatusData) => void;
  updateNetworkQuality: (quality: NetworkStatusData['quality'], responseTime: number) => void;

  // Daily feedback action
  submitDailyFeedback: (studentId: number, rating: DailyFeedbackRating) => Promise<boolean>;

  // Session state cleanup action
  clearSessionState: () => void;
}

// Define the type for the Zustand set function
type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>), replace?: false) => void;

// Define the type for the Zustand get function
type GetState<T> = () => T;

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

// RFID state that should be cleared on session change
// Note: tagToStudentMap is intentionally NOT cleared - it maps RFID tags to student IDs
// which remains useful across sessions
const RFID_SESSION_INITIAL_STATE = {
  recentTagScans: new Map<string, RecentTagScan>(),
  studentHistory: new Map<string, StudentActionHistory>(),
  processingQueue: new Set<string>(),
  optimisticScans: [] as OptimisticScanState[],
};

// Generate a unique id for new activities using unbiased secure randomness
const generateId = (): number => {
  return getSecureRandomInt(10000);
};

// Create mock student data
const mockStudents: Student[] = [
  { id: 1, name: 'Max Mustermann', isCheckedIn: false },
  { id: 2, name: 'Anna Schmidt', isCheckedIn: false },
  { id: 3, name: 'Leon Weber', isCheckedIn: false },
  { id: 4, name: 'Sophie Fischer', isCheckedIn: false },
  { id: 5, name: 'Tim Becker', isCheckedIn: false },
  { id: 6, name: 'Lena Hoffmann', isCheckedIn: false },
];

// Define base store without logging middleware
const createUserStore = (set: SetState<UserState>, get: GetState<UserState>) => ({
  // Initial state
  users: [] as User[],
  selectedUser: '',
  selectedUserId: null,
  authenticatedUser: null,
  rooms: [] as Room[],
  selectedRoom: null,
  _roomSelectedAt: null,
  selectedActivity: null,
  currentSession: null,
  activities: [] as Activity[],
  currentActivity: null,
  isLoading: false,
  error: null,
  nfcScanActive: false,
  selectedSupervisors: [] as User[], // New state for multi-supervisor selection
  activeSupervisorTags: new Set<string>(),

  // RFID initial state
  rfid: {
    isScanning: false,
    currentScan: null,
    blockedTags: new Map<string, number>(),
    scanTimeout: 3000, // 3 seconds
    modalDisplayTime: 2000, // 2 seconds - balanced for animation viewing
    showModal: false,

    // New optimistic state
    optimisticScans: [],
    studentHistory: new Map<string, StudentActionHistory>(),
    processingQueue: new Set<string>(),

    // New duplicate prevention state
    recentTagScans: new Map<string, RecentTagScan>(),
    tagToStudentMap: new Map<string, string>(),
  },

  // Session settings initial state
  sessionSettings: null,
  isValidatingLastSession: false,

  // Network status initial state
  networkStatus: {
    isOnline: true,
    responseTime: 0,
    lastChecked: Date.now(),
    quality: 'online' as const,
  },

  // Actions
  setSelectedUser: (userName: string, userId: number | null) =>
    set({ selectedUser: userName, selectedUserId: userId }),

  setAuthenticatedUser: (userData: {
    staffId: number;
    staffName: string;
    deviceName: string;
    pin: string;
  }) => {
    set({
      authenticatedUser: {
        staffId: userData.staffId,
        staffName: userData.staffName,
        deviceName: userData.deviceName,
        pin: userData.pin,
        authenticatedAt: new Date(),
      },
    });
  },

  setSelectedActivity: (activity: ActivityResponse) => set({ selectedActivity: activity }),

  fetchTeachers: async (forceRefresh = false) => {
    const { isLoading, users } = get();

    // Prevent unnecessary or duplicate requests unless explicitly forced
    if (isLoading && !forceRefresh) {
      storeLogger.debug('Teachers fetch already in progress, skipping');
      return;
    }

    if (!forceRefresh && users.length > 0) {
      storeLogger.debug('Teachers already loaded, skipping fetch');
      return;
    }

    set({ isLoading: true, error: null });
    try {
      storeLogger.info('Fetching teachers from API', { forceRefresh });
      const teachers = await api.getTeachers();
      const users = teachers.map(teacherToUser);

      storeLogger.info('Teachers loaded successfully', { count: users.length });
      set({ users, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      storeLogger.error('Failed to fetch teachers', { error: errorMessage });
      set({
        error: mapServerErrorToGerman(errorMessage),
        isLoading: false,
      });
      throw error;
    }
  },

  fetchRooms: async () => {
    const { authenticatedUser } = get();

    if (!authenticatedUser?.pin) {
      const errorMsg = 'Keine Authentifizierung für das Laden von Räumen';
      storeLogger.warn('Cannot fetch rooms: no authenticated user or PIN');
      set({ error: mapServerErrorToGerman(errorMsg), isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      storeLogger.info('Fetching available rooms from API', {
        staffId: authenticatedUser.staffId,
        staffName: authenticatedUser.staffName,
      });

      const rooms = await api.getRooms(authenticatedUser.pin);

      storeLogger.debug('Available rooms fetched successfully', { count: rooms.length });
      set({ rooms, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Laden der Räume';
      storeLogger.error('Failed to fetch available rooms', { error: errorMessage });
      set({ error: mapServerErrorToGerman(errorMessage), isLoading: false });
    }
  },

  // Store the selected room
  selectRoom: (roomId: number) => {
    const { rooms } = get();
    const roomToSelect = rooms.find(r => r.id === roomId);

    if (roomToSelect) {
      storeLogger.info('Room selected', { roomId, roomName: roomToSelect.name });
      set({ selectedRoom: roomToSelect, _roomSelectedAt: Date.now() });
    } else {
      storeLogger.warn('Room not found', { roomId });
    }
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
      const isRecentManualSelection = roomSelectedAt != null && Date.now() - roomSelectedAt < 5000;
      const shouldPreserveRoom =
        isRecentManualSelection &&
        currentSelectedRoom != null &&
        (sessionRoom == null || currentSelectedRoom.id !== sessionRoom.id);

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

  logout: async () => {
    const { authenticatedUser, currentSession } = get();

    // End current session if exists and user is authenticated
    if (authenticatedUser?.pin && currentSession) {
      try {
        storeLogger.info('Ending current session before logout', {
          activeGroupId: currentSession.active_group_id,
          activityId: currentSession.activity_id,
        });

        await api.endSession(authenticatedUser.pin);
        storeLogger.info('Session ended successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        storeLogger.error('Failed to end session during logout', { error: errorMessage });
        // Continue with logout even if session end fails
      }
    }

    set({
      selectedUser: '',
      selectedUserId: null,
      authenticatedUser: null,
      selectedRoom: null,
      selectedActivity: null,
      currentSession: null,
      currentActivity: null,
      selectedSupervisors: [],
      activeSupervisorTags: new Set<string>(),
    });
  },

  // Cancel activity creation and clear selected room and supervisors
  cancelActivityCreation: () => {
    set({
      currentActivity: null,
      selectedRoom: null,
      selectedSupervisors: [],
    });
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

  clearSelectedSupervisors: () =>
    set({ selectedSupervisors: [], activeSupervisorTags: new Set<string>() }),

  addSupervisorFromRfid: (staffId: number, staffName: string) => {
    const { selectedSupervisors } = get();
    const isAlreadySelected = selectedSupervisors.some(s => s.id === staffId);

    if (isAlreadySelected) {
      storeLogger.info('Supervisor already in selectedSupervisors via RFID', {
        staffId,
        staffName,
      });
      return true; // Already present - second scan
    }

    const newSupervisor: User = { id: staffId, name: staffName };
    set({
      selectedSupervisors: [...selectedSupervisors, newSupervisor],
      activeSupervisorTags: new Set<string>(),
    });

    storeLogger.info('Supervisor added to selectedSupervisors via RFID', {
      staffId,
      staffName,
      totalSupervisors: selectedSupervisors.length + 1,
    });

    return false; // Was not present - first scan
  },

  addActiveSupervisorTag: (tagId: string) => {
    set(state => {
      const updatedTags = new Set(state.activeSupervisorTags);
      updatedTags.add(tagId);
      return { activeSupervisorTags: updatedTags };
    });
    storeLogger.debug('RFID tag saved for supervisor', { tagId });
  },

  isActiveSupervisor: (tagId: string) => {
    return get().activeSupervisorTags.has(tagId);
  },

  clearActiveSupervisorTags: () => {
    set({ activeSupervisorTags: new Set<string>() });
    storeLogger.debug('Active supervisor tags cleared');
  },

  // Activity-related actions
  initializeActivity: (roomId: number) => {
    const { selectedUser, users } = get();
    // Find the user's ID
    const creator = users.find(u => u.name === selectedUser);

    set({
      currentActivity: {
        name: '', // Initialize with empty name to ensure the field exists
        roomId,
        createdBy: selectedUser,
        category: ActivityCategory.OTHER,
        createdAt: new Date(),
        supervisorId: creator?.id ?? -1, // default to the current user as supervisor
      },
    });

    storeLogger.debug('Activity initialized', { roomId });
  },

  updateActivityField: <K extends keyof Activity>(field: K, value: Activity[K]) => {
    const { currentActivity } = get();
    if (currentActivity) {
      set({
        currentActivity: {
          ...currentActivity,
          [field]: value,
        },
      });

      // Special logging for name field to help track the issue
      if (field === 'name') {
        storeLogger.info('Activity name updated', {
          prev: currentActivity.name,
          next: value,
          activityDetails: {
            roomId: currentActivity.roomId,
            category: currentActivity.category,
          },
        });
      }
    }
  },

  createActivity: async () => {
    set({ isLoading: true, error: null });
    try {
      const { currentActivity, activities, selectedRoom } = get();

      // Validate required fields
      if (
        !currentActivity?.name ||
        !currentActivity.supervisorId ||
        !currentActivity.category ||
        !currentActivity.roomId ||
        !selectedRoom
      ) {
        set({
          error: 'Bitte fülle alle Pflichtfelder aus',
          isLoading: false,
        });
        return false;
      }

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create the new activity with all required fields
      const newActivity: Activity = {
        ...(currentActivity as Activity),
        id: generateId(),
        createdAt: new Date(),
      };

      // Log the activity creation with all fields for debugging
      storeLogger.info('Creating new activity', {
        id: newActivity.id,
        name: newActivity.name,
        category: newActivity.category,
        roomId: newActivity.roomId,
        supervisorId: newActivity.supervisorId,
      });

      // Add to activities array and clear current activity
      set({
        activities: [...activities, newActivity],
        currentActivity: null,
        isLoading: false,
      });

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      storeLogger.error('Failed to create activity', {
        message: error.message,
        stack: error.stack,
      });

      const errorMsg = isNetworkRelatedError(err)
        ? 'Netzwerkfehler beim Erstellen der Aktivität. Bitte Verbindung prüfen und erneut versuchen.'
        : mapServerErrorToGerman(error.message);
      set({
        error: errorMsg,
        isLoading: false,
      });
      return false;
    }
  },

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

  // Check-in/check-out related actions with deep safeguards to prevent infinite loops
  startNfcScan: (() => {
    // Closure-based guard variable to prevent repeat state changes
    let isStarting = false;

    // Using IIFE to create a stable reference that doesn't change on re-renders
    const fn = () => {
      // Skip if already in the process of starting
      if (isStarting) return;

      isStarting = true;
      try {
        const { nfcScanActive } = get();
        // Only set if not already active to prevent unnecessary updates
        if (!nfcScanActive) {
          set({ nfcScanActive: true });
        }
      } finally {
        // Always reset the lock flag to prevent deadlocks
        setTimeout(() => {
          isStarting = false;
        }, 0);
      }
    };
    return fn;
  })(),

  stopNfcScan: (() => {
    // Closure-based guard variable to prevent repeat state changes
    let isStopping = false;

    // Using IIFE to create a stable reference that doesn't change on re-renders
    const fn = () => {
      // Skip if already in the process of stopping
      if (isStopping) return;

      isStopping = true;
      try {
        const { nfcScanActive } = get();
        // Only set if active to prevent unnecessary updates
        if (nfcScanActive) {
          set({ nfcScanActive: false });
        }
      } finally {
        // Always reset the lock flag to prevent deadlocks
        setTimeout(() => {
          isStopping = false;
        }, 0);
      }
    };
    return fn;
  })(),

  checkInStudent: async (
    activityId: number,
    student: Omit<Student, 'checkInTime' | 'isCheckedIn'>
  ) => {
    set({ isLoading: true, error: null });
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { activities } = get();
      const activityIndex = activities.findIndex(a => a.id === activityId);

      if (activityIndex === -1) {
        set({
          error: mapActivityError('activity_not_found', { activityId }),
          isLoading: false,
        });
        return false;
      }

      // Create a copy of the activities array
      const updatedActivities = [...activities];
      const activity = updatedActivities[activityIndex];

      // Initialize checkedInStudents array if it doesn't exist
      activity.checkedInStudents ??= [];

      // Check if student is already checked in
      const existingStudentIndex = activity.checkedInStudents.findIndex(s => s.id === student.id);

      if (existingStudentIndex === -1) {
        // Add new student to checked in list
        activity.checkedInStudents.push({
          ...student,
          checkInTime: new Date(),
          isCheckedIn: true,
        });
      } else if (activity.checkedInStudents[existingStudentIndex].isCheckedIn) {
        // Student is already checked in - show error
        set({
          error: mapActivityError('student_already_checked_in', {
            studentName: student.name,
            activityName: activity.name,
          }),
          isLoading: false,
        });
        return false;
      } else {
        // Student was checked out - re-check them in
        activity.checkedInStudents[existingStudentIndex] = {
          ...activity.checkedInStudents[existingStudentIndex],
          checkInTime: new Date(),
          checkOutTime: undefined,
          isCheckedIn: true,
        };
      }

      // Update activities array
      set({ activities: updatedActivities, isLoading: false });
      return true;
    } catch (error) {
      set({
        error: mapActivityError('checkin_failed', { studentName: student.name }, error),
        isLoading: false,
      });
      return false;
    }
  },

  checkOutStudent: async (activityId: number, studentId: number) => {
    set({ isLoading: true, error: null });

    // Get student name early for error context (before try block)
    const { activities } = get();
    const activity = activities.find(a => a.id === activityId);
    const student = activity?.checkedInStudents?.find(s => s.id === studentId);
    const studentName = student?.name;

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const activityIndex = activities.findIndex(a => a.id === activityId);

      if (activityIndex === -1) {
        set({
          error: mapActivityError('activity_not_found', { activityId }),
          isLoading: false,
        });
        return false;
      }

      // Create a copy of the activities array
      const updatedActivities = [...activities];
      const activity = updatedActivities[activityIndex];

      // Check if there are any checked in students
      if (!activity.checkedInStudents || activity.checkedInStudents.length === 0) {
        set({
          error: mapActivityError('no_students_checked_in', { activityName: activity.name }),
          isLoading: false,
        });
        return false;
      }

      // Find the student to check out
      const studentIndex = activity.checkedInStudents.findIndex(
        s => s.id === studentId && s.isCheckedIn
      );

      if (studentIndex === -1) {
        set({
          error: mapActivityError('student_not_checked_in', { activityName: activity.name }),
          isLoading: false,
        });
        return false;
      }

      // Update student's check-out time and status
      activity.checkedInStudents[studentIndex] = {
        ...activity.checkedInStudents[studentIndex],
        checkOutTime: new Date(),
        isCheckedIn: false,
      };

      // Update activities array
      set({ activities: updatedActivities, isLoading: false });
      return true;
    } catch (error) {
      set({
        error: mapActivityError('checkout_failed', { studentName }, error),
        isLoading: false,
      });
      return false;
    }
  },

  getActivityStudents: (activityId: number) => {
    const { activities } = get();
    const activity = activities.find(a => a.id === activityId);

    if (!activity?.checkedInStudents) {
      // For demo purposes, return mock students if no real ones exist
      return mockStudents;
    }

    return activity.checkedInStudents;
  },

  // RFID actions
  startRfidScanning: () => {
    set(state => ({
      rfid: { ...state.rfid, isScanning: true },
    }));
  },

  stopRfidScanning: () => {
    set(state => ({
      rfid: { ...state.rfid, isScanning: false, currentScan: null },
    }));
  },

  setScanResult: (result: RfidScanResult | null) => {
    set(state => ({
      rfid: { ...state.rfid, currentScan: result },
    }));
  },

  blockTag: (tagId: string, duration: number) => {
    const blockUntil = Date.now() + duration;
    set(state => {
      const newBlockedTags = new Map(state.rfid.blockedTags);
      newBlockedTags.set(tagId, blockUntil);
      return {
        rfid: { ...state.rfid, blockedTags: newBlockedTags },
      };
    });
  },

  isTagBlocked: (tagId: string) => {
    const { rfid } = get();
    const blockUntil = rfid.blockedTags.get(tagId);
    if (!blockUntil) return false;

    const isBlocked = Date.now() < blockUntil;
    if (!isBlocked) {
      // Clean up expired block
      get().clearBlockedTag(tagId);
    }
    return isBlocked;
  },

  clearBlockedTag: (tagId: string) => {
    set(state => {
      const newBlockedTags = new Map(state.rfid.blockedTags);
      newBlockedTags.delete(tagId);
      return {
        rfid: { ...state.rfid, blockedTags: newBlockedTags },
      };
    });
  },

  showScanModal: () => {
    set(state => ({
      rfid: { ...state.rfid, showModal: true },
    }));
  },

  hideScanModal: () => {
    set(state => ({
      rfid: { ...state.rfid, showModal: false, currentScan: null },
    }));
  },

  // New optimistic RFID actions
  addOptimisticScan: (scan: OptimisticScanState) => {
    set(state => ({
      rfid: {
        ...state.rfid,
        optimisticScans: [...state.rfid.optimisticScans, scan],
      },
    }));
  },

  updateOptimisticScan: (id: string, status: OptimisticScanState['status']) => {
    set(state => ({
      rfid: {
        ...state.rfid,
        optimisticScans: state.rfid.optimisticScans.map(scan =>
          scan.id === id ? { ...scan, status } : scan
        ),
      },
    }));
  },

  removeOptimisticScan: (id: string) => {
    set(state => ({
      rfid: {
        ...state.rfid,
        optimisticScans: state.rfid.optimisticScans.filter(scan => scan.id !== id),
      },
    }));
  },

  updateStudentHistory: (studentId: string, action: 'checkin' | 'checkout') => {
    set(state => {
      const newHistory = new Map(state.rfid.studentHistory);
      newHistory.set(studentId, {
        studentId,
        lastAction: action,
        timestamp: Date.now(),
        isProcessing: false,
      });
      return {
        rfid: { ...state.rfid, studentHistory: newHistory },
      };
    });
  },

  isValidScan: (studentId: string, action: 'checkin' | 'checkout') => {
    const { rfid } = get();
    const history = rfid.studentHistory.get(studentId);

    // Allow if no previous action
    if (!history) return true;

    // Allow same action (idempotent)
    if (history.lastAction === action) return true;

    // Block opposite action only if recent (10s) and still processing
    if (history.isProcessing && Date.now() - history.timestamp < 10000) {
      return false;
    }

    return true;
  },

  addToProcessingQueue: (tagId: string) => {
    set(state => {
      const newQueue = new Set(state.rfid.processingQueue);
      newQueue.add(tagId);
      return {
        rfid: { ...state.rfid, processingQueue: newQueue },
      };
    });
  },

  removeFromProcessingQueue: (tagId: string) => {
    set(state => {
      const newQueue = new Set(state.rfid.processingQueue);
      newQueue.delete(tagId);
      return {
        rfid: { ...state.rfid, processingQueue: newQueue },
      };
    });
  },

  // Enhanced duplicate prevention functions
  canProcessTag: (tagId: string) => {
    const { rfid } = get();

    // Layer 1: Check if tag is currently being processed
    if (rfid.processingQueue.has(tagId)) {
      return false;
    }

    // Layer 2: Check recent tag scans (within 2 seconds)
    const recentScan = rfid.recentTagScans.get(tagId);
    if (recentScan && Date.now() - recentScan.timestamp < 2000) {
      return false;
    }

    // Layer 3: If we know the studentId, check student history
    const studentId = rfid.tagToStudentMap.get(tagId);
    if (studentId) {
      return get().isValidStudentScan(studentId, 'checkin');
    }

    return true;
  },

  recordTagScan: (tagId: string, scan: RecentTagScan) => {
    set(state => {
      const newScans = new Map(state.rfid.recentTagScans);
      newScans.set(tagId, scan);
      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },

  clearTagScan: (tagId: string) => {
    set(state => {
      const newScans = new Map(state.rfid.recentTagScans);
      newScans.delete(tagId);
      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },

  mapTagToStudent: (tagId: string, studentId: string) => {
    set(state => {
      const newMap = new Map(state.rfid.tagToStudentMap);
      newMap.set(tagId, studentId);
      return {
        rfid: { ...state.rfid, tagToStudentMap: newMap },
      };
    });
  },

  getCachedStudentId: (tagId: string) => {
    const { rfid } = get();
    return rfid.tagToStudentMap.get(tagId);
  },

  clearOldTagScans: () => {
    set(state => {
      const now = Date.now();
      const newScans = new Map<string, RecentTagScan>();

      // Keep only scans from last 2 seconds
      state.rfid.recentTagScans.forEach((scan, tagId) => {
        if (now - scan.timestamp < 2000) {
          newScans.set(tagId, scan);
        }
      });

      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },

  // Rename isValidScan to isValidStudentScan for clarity
  isValidStudentScan: (studentId: string, action: 'checkin' | 'checkout') => {
    const { rfid } = get();
    const history = rfid.studentHistory.get(studentId);

    // Allow if no previous action
    if (!history) return true;

    // Allow same action (idempotent)
    if (history.lastAction === action) return true;

    // Block opposite action only if recent (10s) and still processing
    if (history.isProcessing && Date.now() - history.timestamp < 10000) {
      return false;
    }

    return true;
  },

  // Network status actions
  setNetworkStatus: (status: NetworkStatusData) => {
    set({ networkStatus: status });
  },

  updateNetworkQuality: (quality: NetworkStatusData['quality'], responseTime: number) => {
    set(state => ({
      networkStatus: {
        ...state.networkStatus,
        quality,
        responseTime,
        lastChecked: Date.now(),
        isOnline: quality !== 'offline',
      },
    }));
  },

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

  clearSessionSettings: async () => {
    try {
      await clearLastSession();
      const { sessionSettings } = get();
      set({
        sessionSettings: sessionSettings
          ? { ...sessionSettings, last_session: null, use_last_session: false }
          : null,
        activeSupervisorTags: new Set<string>(),
      });
      storeLogger.info('Session settings cleared');
    } catch (error) {
      storeLogger.error('Failed to clear session settings', { error });
    }
  },

  // Submit daily feedback
  submitDailyFeedback: async (studentId: number, rating: DailyFeedbackRating): Promise<boolean> => {
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
        // Preserve tagToStudentMap - useful across sessions for tag-to-student lookups
      },
    }));
  },
});

// Create the store with logging middleware
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, {
    name: 'UserStore',
    logLevel: LogLevel.DEBUG,
    activityTracking: true,
    stateChanges: true,
    actionSource: true,
    // Exclude certain high-frequency actions to reduce noise
    excludedActions: ['functionalUpdate'],
  })
);
