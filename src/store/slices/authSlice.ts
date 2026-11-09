import { api, type Teacher } from '../../services/api';
import {
  getAccessLossReason,
  mapApiErrorToGerman,
  type AccessLossReason,
} from '../../services/apiErrors';
import { createLogger } from '../../utils/logger';
import type { GetState, SetState, UserState } from '../userStore';

// Create a store-specific logger instance
const storeLogger = createLogger('UserStore');

// Define the User interface
export interface User {
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
export interface AuthenticatedUser {
  staffId: number;
  staffName: string;
  deviceName: string;
  pin: string; // Store PIN for subsequent API calls
}

/**
 * Resolve the staff member who can safely receive attribution for a kiosk action.
 *
 * Global-PIN logins have no staff identity (`staffId: 0`). In that flow, a sole
 * selected supervisor is unambiguous. Multiple supervisors require an explicit
 * acting-person choice, so no ID is inferred.
 */
export function resolveStaffAttributionId(
  authenticatedUser: AuthenticatedUser,
  selectedSupervisors: readonly User[]
): number | undefined {
  if (authenticatedUser.staffId > 0) {
    return authenticatedUser.staffId;
  }

  if (selectedSupervisors.length === 1 && selectedSupervisors[0].id > 0) {
    return selectedSupervisors[0].id;
  }

  return undefined;
}

const ACCESS_LOSS_TITLE = 'Abgemeldet';

/** Kiosk copy per reason; a missing module shows the module's own text. */
const accessLossMessage = (reason: AccessLossReason, error: unknown): string => {
  switch (reason) {
    case 'pin':
      return 'Die PIN hat sich geändert. Bitte mit der neuen PIN anmelden.';
    case 'device':
      return 'Dieses Gerät hat keinen Zugang mehr zu moto. Bitte an die Leitung wenden.';
    case 'module':
      return mapApiErrorToGerman(error);
  }
};

export const createAuthSlice = (set: SetState<UserState>, get: GetState<UserState>) => ({
  // Initial state
  users: [] as User[],
  authenticatedUser: null,

  // Actions
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
      },
    });
  },

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
        error: mapApiErrorToGerman(error instanceof Error ? error : errorMessage),
        isLoading: false,
      });
      throw error;
    }
  },

  // Central reaction to an error answer of any request: when the server no
  // longer accepts the login (stored PIN refused, device without access,
  // module NFC-Anwesenheit not booked) the kiosk logs out at once. It sends no
  // further request: every one would be refused the same way.
  handleAccessError: (error: unknown, requestPin: string | undefined) => {
    const reason = getAccessLossReason(error);
    if (!reason) return;
    const { authenticatedUser } = get();
    if (!authenticatedUser) return;
    // A PIN typed on the PIN page that differs from the stored one says
    // nothing about the login; only a refused stored PIN does.
    if (reason === 'pin' && requestPin !== authenticatedUser.pin) return;

    storeLogger.warn('Server no longer accepts the kiosk login, logging out', { reason });
    get().invalidateSessionRecreation();
    set({
      authenticatedUser: null,
      selectedRoom: null,
      selectedActivity: null,
      currentSession: null,
      selectedSupervisors: [],
      activeSupervisorTags: new Set<string>(),
      isValidatingLastSession: false,
      kioskNotice: { title: ACCESS_LOSS_TITLE, message: accessLossMessage(reason, error) },
    });
  },

  logout: async () => {
    // Invalidate validation/recreation before awaiting any network request so
    // stale responses cannot repopulate state after logout.
    get().invalidateSessionRecreation();
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
      authenticatedUser: null,
      selectedRoom: null,
      selectedActivity: null,
      currentSession: null,
      selectedSupervisors: [],
      activeSupervisorTags: new Set<string>(),
      isValidatingLastSession: false,
    });
  },
});
