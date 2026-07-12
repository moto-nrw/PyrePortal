import { api, mapServerErrorToGerman, type Teacher } from '../../services/api';
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
        error: mapServerErrorToGerman(errorMessage),
        isLoading: false,
      });
      throw error;
    }
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
