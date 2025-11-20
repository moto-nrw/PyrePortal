import { create } from 'zustand';

import type { NetworkStatusData } from '../components/ui/NetworkStatus';
import {
  api,
  mapServerErrorToGerman,
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
import {
  type StudentCacheData,
  type CachedStudent,
  loadStudentCache,
  saveStudentCache,
  getCachedStudent,
  setCachedStudent,
  scanResultToCachedStudent,
} from '../services/studentCache';
import { createLogger, LogLevel } from '../utils/logger';
import { loggerMiddleware } from '../utils/storeMiddleware';
import { safeInvoke } from '../utils/tauriContext';

// Create a store-specific logger instance
const storeLogger = createLogger('UserStore');

// Define the ActivityCategory enum
export enum ActivityCategory {
  SPORT = 'Sport',
  SCIENCE = 'Wissenschaft',
  ART = 'Kunst',
  MUSIC = 'Musik',
  LITERATURE = 'Literatur',
  GAMES = 'Spiele',
  OTHER = 'Sonstiges',
}

// Define the Activity interface
export interface Activity {
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

export interface Student {
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
  selectedActivity: ActivityResponse | null;
  currentSession: CurrentSession | null;
  activities: Activity[];
  currentActivity: Partial<Activity> | null;
  isLoading: boolean;
  error: string | null;
  nfcScanActive: boolean;
  selectedSupervisors: User[]; // Selected supervisors for multi-supervisor sessions

  // RFID scanning state
  rfid: RfidState;

  // Session settings state
  sessionSettings: SessionSettings | null;
  isValidatingLastSession: boolean;

  // Network status state
  networkStatus: NetworkStatusData;

  // Student cache state
  studentCache: StudentCacheData | null;
  isCacheLoading: boolean;

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

  // Student cache actions
  loadStudentCache: () => Promise<void>;
  getCachedStudentData: (rfidTag: string) => CachedStudent | null;
  cacheStudentData: (
    rfidTag: string,
    scanResult: RfidScanResult,
    additionalData?: { room?: string; activity?: string }
  ) => Promise<void>;
  updateCachedStudentStatus: (
    rfidTag: string,
    status: 'checked_in' | 'checked_out'
  ) => Promise<void>;
  clearStudentCache: () => Promise<void>;

  // Daily feedback action
  submitDailyFeedback: (studentId: number, rating: DailyFeedbackRating) => Promise<boolean>;
}

// Define the type for the Zustand set function
type SetState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: false
) => void;

// Define the type for the Zustand get function
type GetState<T> = () => T;

// Generate a unique id for new activities
const generateId = (): number => {
  return Math.floor(Math.random() * 10000);
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
  selectedActivity: null,
  currentSession: null,
  activities: [] as Activity[],
  currentActivity: null,
  isLoading: false,
  error: null,
  nfcScanActive: false,
  selectedSupervisors: [] as User[], // New state for multi-supervisor selection

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
    isOnline: navigator.onLine,
    responseTime: 0,
    lastChecked: Date.now(),
    quality: 'excellent' as const,
  },

  // Student cache initial state
  studentCache: null,
  isCacheLoading: false,

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
      set({ selectedRoom: roomToSelect });
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

      if (session) {
        storeLogger.info('Active session found', {
          activeGroupId: session.active_group_id,
          activityId: session.activity_id,
          activityName: session.activity_name,
          roomName: session.room_name,
          startTime: session.start_time,
          duration: session.duration,
        });

        // Also set selected activity and room based on session if we have the data
        let sessionActivity: ActivityResponse | null = null;
        let sessionRoom: Room | null = null;

        // Get the current selectedActivity to preserve its data
        const currentSelectedActivity = get().selectedActivity;

        if (session.activity_name) {
          // If we already have a selectedActivity with the same ID, preserve its data
          if (currentSelectedActivity && currentSelectedActivity.id === session.activity_id) {
            sessionActivity = currentSelectedActivity;
          } else {
            // Fetch complete activity data to get accurate max_participants and other fields
            try {
              storeLogger.debug('Fetching activities to restore complete session activity data', {
                activityId: session.activity_id,
              });
              const activities = await api.getActivities(authenticatedUser.pin);
              const matchingActivity = activities.find(
                activity => activity.id === session.activity_id
              );

              if (matchingActivity) {
                sessionActivity = matchingActivity;
                storeLogger.info('Session activity restored from API with complete data', {
                  activityId: session.activity_id,
                  maxParticipants: matchingActivity.max_participants,
                  enrollmentCount: matchingActivity.enrollment_count,
                });
              } else {
                // Fallback to minimal activity object if activity not found in API response
                sessionActivity = {
                  id: session.activity_id,
                  name: session.activity_name,
                  category: '',
                  category_name: '',
                  category_color: '',
                  room_name: session.room_name ?? '',
                  enrollment_count: 0,
                  max_participants: 0,
                  has_spots: true,
                  supervisor_name: authenticatedUser.staffName,
                  is_active: session.is_active ?? true,
                };
                storeLogger.warn(
                  'Activity not found in API response during session restoration, using fallback with limited data',
                  {
                    activityId: session.activity_id,
                    availableActivityIds: activities.map(a => a.id),
                  }
                );
              }
            } catch (error) {
              // If API call fails, use minimal activity object as fallback
              sessionActivity = {
                id: session.activity_id,
                name: session.activity_name,
                category: '',
                category_name: '',
                category_color: '',
                room_name: session.room_name ?? '',
                enrollment_count: 0,
                max_participants: 0,
                has_spots: true,
                supervisor_name: authenticatedUser.staffName,
                is_active: session.is_active ?? true,
              };
              storeLogger.error(
                'Failed to fetch activities during session restoration, using fallback',
                {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  activityId: session.activity_id,
                }
              );
            }
          }
        }

        if (session.room_id && session.room_name) {
          sessionRoom = {
            id: session.room_id,
            name: session.room_name,
            is_occupied: true, // Current session room is always occupied
          };
        }

        set({
          currentSession: session,
          selectedActivity: sessionActivity,
          selectedRoom: sessionRoom,
        });
      } else {
        storeLogger.debug('No active session found for device');
        set({ currentSession: null });
      }
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
  setSelectedSupervisors: (supervisors: User[]) => set({ selectedSupervisors: supervisors }),

  toggleSupervisor: (user: User) => {
    const { selectedSupervisors } = get();
    const isSelected = selectedSupervisors.some(s => s.id === user.id);

    if (isSelected) {
      // Remove supervisor
      set({
        selectedSupervisors: selectedSupervisors.filter(s => s.id !== user.id),
      });
    } else {
      // Add supervisor
      set({
        selectedSupervisors: [...selectedSupervisors, user],
      });
    }
  },

  clearSelectedSupervisors: () => set({ selectedSupervisors: [] }),

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

      set({
        error: 'Fehler beim Erstellen der Aktivität',
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
            activities: activitiesData.map(a => ({
              id: a.id,
              name: a.name,
              category: a.category_name,
            })),
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
        set({ error: 'Aktivität nicht gefunden', isLoading: false });
        return false;
      }

      // Create a copy of the activities array
      const updatedActivities = [...activities];
      const activity = updatedActivities[activityIndex];

      // Initialize checkedInStudents array if it doesn't exist
      activity.checkedInStudents ??= [];

      // Check if student is already checked in
      const existingStudentIndex = activity.checkedInStudents.findIndex(s => s.id === student.id);

      if (existingStudentIndex !== -1) {
        // If student already checked in but checked out, update their status
        if (!activity.checkedInStudents[existingStudentIndex].isCheckedIn) {
          activity.checkedInStudents[existingStudentIndex] = {
            ...activity.checkedInStudents[existingStudentIndex],
            checkInTime: new Date(),
            checkOutTime: undefined,
            isCheckedIn: true,
          };
        } else {
          // Student is already checked in
          set({ error: 'Schüler/in ist bereits eingecheckt', isLoading: false });
          return false;
        }
      } else {
        // Add new student to checked in list
        activity.checkedInStudents.push({
          ...student,
          checkInTime: new Date(),
          isCheckedIn: true,
        });
      }

      // Update activities array
      set({ activities: updatedActivities, isLoading: false });
      return true;
    } catch {
      set({ error: 'Fehler beim Einchecken des Schülers/der Schülerin', isLoading: false });
      return false;
    }
  },

  checkOutStudent: async (activityId: number, studentId: number) => {
    set({ isLoading: true, error: null });
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { activities } = get();
      const activityIndex = activities.findIndex(a => a.id === activityId);

      if (activityIndex === -1) {
        set({ error: 'Aktivität nicht gefunden', isLoading: false });
        return false;
      }

      // Create a copy of the activities array
      const updatedActivities = [...activities];
      const activity = updatedActivities[activityIndex];

      // Check if there are any checked in students
      if (!activity.checkedInStudents || activity.checkedInStudents.length === 0) {
        set({ error: 'Keine Schüler/innen eingecheckt', isLoading: false });
        return false;
      }

      // Find the student to check out
      const studentIndex = activity.checkedInStudents.findIndex(
        s => s.id === studentId && s.isCheckedIn
      );

      if (studentIndex === -1) {
        set({ error: 'Schüler/in ist nicht eingecheckt', isLoading: false });
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
    } catch {
      set({ error: 'Fehler beim Auschecken des Schülers/der Schülerin', isLoading: false });
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

  // Student cache actions
  loadStudentCache: async () => {
    const state = get();
    if (state.isCacheLoading) {
      storeLogger.debug('Student cache already loading, skipping');
      return;
    }

    set({ isCacheLoading: true });

    try {
      storeLogger.debug('Loading student cache from storage');
      const cache = await loadStudentCache();

      set({
        studentCache: cache,
        isCacheLoading: false,
      });

      storeLogger.info('Student cache loaded successfully', {
        hasCache: !!cache,
        entryCount: cache ? Object.keys(cache.students).length : 0,
      });
    } catch (error) {
      storeLogger.error('Failed to load student cache', { error });
      set({
        studentCache: null,
        isCacheLoading: false,
      });
    }
  },

  getCachedStudentData: (rfidTag: string) => {
    const { studentCache } = get();
    if (!studentCache) {
      return null;
    }

    const cachedStudent = getCachedStudent(studentCache, rfidTag);
    if (cachedStudent) {
      storeLogger.debug('Found cached student data', {
        rfidTag,
        studentId: cachedStudent.id,
        studentName: cachedStudent.name,
        status: cachedStudent.status,
      });
    }

    return cachedStudent;
  },

  cacheStudentData: async (
    rfidTag: string,
    scanResult: RfidScanResult,
    additionalData?: { room?: string; activity?: string }
  ) => {
    const { studentCache } = get();

    try {
      // Create or use existing cache
      const cache = studentCache ?? (await loadStudentCache());

      // Convert scan result to cached student format
      const studentData = scanResultToCachedStudent(scanResult, additionalData);

      // Update cache
      const updatedCache = setCachedStudent(cache, rfidTag, studentData);

      // Update store state
      set({ studentCache: updatedCache });

      // Persist to storage
      await saveStudentCache(updatedCache);

      storeLogger.info('Student data cached successfully', {
        rfidTag,
        studentId: studentData.id,
        studentName: studentData.name,
        status: studentData.status,
      });
    } catch (error) {
      storeLogger.error('Failed to cache student data', {
        error,
        rfidTag,
        studentId: scanResult.student_id,
      });
    }
  },

  updateCachedStudentStatus: async (rfidTag: string, status: 'checked_in' | 'checked_out') => {
    const { studentCache } = get();
    if (!studentCache?.students[rfidTag]) {
      storeLogger.debug('No cached student to update status for', { rfidTag });
      return;
    }

    try {
      const existingStudent = studentCache.students[rfidTag];
      const updatedStudent: Omit<CachedStudent, 'cachedAt'> = {
        ...existingStudent,
        status,
        lastSeen: new Date().toISOString(),
      };

      const updatedCache = setCachedStudent(studentCache, rfidTag, updatedStudent);

      // Update store state
      set({ studentCache: updatedCache });

      // Persist to storage
      await saveStudentCache(updatedCache);

      storeLogger.info('Cached student status updated', {
        rfidTag,
        studentId: existingStudent.id,
        newStatus: status,
      });
    } catch (error) {
      storeLogger.error('Failed to update cached student status', {
        error,
        rfidTag,
        status,
      });
    }
  },

  clearStudentCache: async () => {
    try {
      // Clear from storage
      await safeInvoke('clear_student_cache');

      // Clear from store
      set({ studentCache: null });

      storeLogger.info('Student cache cleared successfully');
    } catch (error) {
      storeLogger.error('Failed to clear student cache', { error });
    }
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

      // Check supervisors - use current if already selected, otherwise validate saved ones
      const { selectedSupervisors, users } = get();
      let supervisors = selectedSupervisors;

      if (supervisors.length === 0) {
        // Ensure we have teachers loaded first
        if (users.length === 0) {
          storeLogger.debug('Loading teachers to validate supervisors');
          await get().fetchTeachers();
          const updatedUsers = get().users;

          if (updatedUsers.length === 0) {
            throw new Error('Fehler beim Laden der Betreuer');
          }

          // Now try to find supervisors with loaded users
          supervisors = sessionSettings.last_session.supervisor_ids
            .map(id => updatedUsers.find(u => u.id === id))
            .filter((u): u is User => u !== undefined);
        } else {
          // Users already loaded, validate saved supervisors
          supervisors = sessionSettings.last_session.supervisor_ids
            .map(id => users.find(u => u.id === id))
            .filter((u): u is User => u !== undefined);
        }

        if (supervisors.length === 0) {
          storeLogger.warn('No valid supervisors found', {
            savedIds: sessionSettings.last_session.supervisor_ids,
            availableUsers: users.length === 0 ? get().users.map(u => u.id) : users.map(u => u.id),
          });
          throw new Error('Keine gültigen Betreuer gefunden');
        }
      }

      // Set validated data in store
      set({
        selectedActivity: activity,
        selectedRoom: room,
        selectedSupervisors: supervisors,
        isValidatingLastSession: false,
      });

      storeLogger.info('Session validation successful', {
        activityId: activity.id,
        roomId: room.id,
        supervisorCount: supervisors.length,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validierung fehlgeschlagen';
      storeLogger.error('Session validation failed', { error: errorMessage });

      // Clear invalid session data
      await clearLastSession();
      set({
        sessionSettings: { ...sessionSettings, last_session: null, use_last_session: false },
        isValidatingLastSession: false,
        error: errorMessage,
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
