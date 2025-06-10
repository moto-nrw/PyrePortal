import { create } from 'zustand';

import { api, type Teacher, type ActivityResponse } from '../services/api';
import { createLogger, LogLevel } from '../utils/logger';
import { loggerMiddleware } from '../utils/storeMiddleware';

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

// Define the Room interface
interface Room {
  id: number;
  name: string;
  isOccupied: boolean;
  occupiedBy?: string;
}

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

// Define the store state interface
interface UserState {
  // State
  users: User[];
  selectedUser: string;
  authenticatedUser: AuthenticatedUser | null;
  rooms: Room[];
  selectedRoom: Room | null;
  activities: Activity[];
  currentActivity: Partial<Activity> | null;
  isLoading: boolean;
  error: string | null;
  nfcScanActive: boolean;

  // Actions
  setSelectedUser: (user: string) => void;
  setAuthenticatedUser: (userData: { staffId: number; staffName: string; deviceName: string; pin: string }) => void;
  fetchTeachers: () => Promise<void>;
  fetchRooms: () => Promise<void>;
  selectRoom: (roomId: number) => Promise<boolean>;
  logout: () => void;

  // Activity-related actions
  initializeActivity: (roomId: number) => void;
  updateActivityField: <K extends keyof Activity>(field: K, value: Activity[K]) => void;
  createActivity: () => Promise<boolean>;
  fetchActivities: () => Promise<ActivityResponse[] | null>;
  cancelActivityCreation: () => void;

  // Check-in/check-out actions
  startNfcScan: () => void;
  stopNfcScan: () => void;
  checkInStudent: (
    activityId: number,
    student: Omit<Student, 'checkInTime' | 'isCheckedIn'>
  ) => Promise<boolean>;
  checkOutStudent: (activityId: number, studentId: number) => Promise<boolean>;
  getActivityStudents: (activityId: number) => Student[];
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
  authenticatedUser: null,
  rooms: [] as Room[],
  selectedRoom: null,
  activities: [] as Activity[],
  currentActivity: null,
  isLoading: false,
  error: null,
  nfcScanActive: false,

  // Actions
  setSelectedUser: (user: string) => set({ selectedUser: user }),
  
  setAuthenticatedUser: (userData: { staffId: number; staffName: string; deviceName: string; pin: string }) => {
    set({ 
      authenticatedUser: {
        staffId: userData.staffId,
        staffName: userData.staffName,
        deviceName: userData.deviceName,
        pin: userData.pin,
        authenticatedAt: new Date()
      }
    });
  },

  fetchTeachers: async () => {
    const { isLoading, users } = get();
    
    // Prevent duplicate requests
    if (isLoading) {
      storeLogger.debug('Teachers fetch already in progress, skipping');
      return;
    }
    
    // Skip if we already have teachers
    if (users.length > 0) {
      storeLogger.debug('Teachers already loaded, skipping fetch');
      return;
    }
    
    set({ isLoading: true, error: null });
    try {
      storeLogger.info('Fetching teachers from API');
      const teachers = await api.getTeachers();
      const users = teachers.map(teacherToUser);
      
      storeLogger.info('Teachers loaded successfully', { count: users.length });
      set({ users, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      storeLogger.error('Failed to fetch teachers', { error: errorMessage });
      set({ 
        error: 'Fehler beim Laden der Lehrer. Bitte versuchen Sie es erneut.',
        isLoading: false 
      });
      throw error;
    }
  },

  fetchRooms: async () => {
    set({ isLoading: true, error: null });
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Only load mock data for initial fetch, preserve state for subsequent fetches
      if (get().rooms.length === 0) {
        const mockRooms: Room[] = [
          { id: 1, name: 'Raum 101', isOccupied: false },
          { id: 2, name: 'Raum 102', isOccupied: true, occupiedBy: 'Thomas Müller' },
          { id: 3, name: 'Raum 103', isOccupied: false },
          { id: 4, name: 'Toilette EG', isOccupied: false },
          { id: 5, name: 'Schulhof', isOccupied: false },
        ];

        set({ rooms: mockRooms, isLoading: false });
      } else {
        // Just update loading state for subsequent calls to preserve existing room state
        set({ isLoading: false });
      }
    } catch {
      set({ error: 'Fehler beim Laden der Räume', isLoading: false });
    }
  },

  // Store the selected room and mark it as occupied
  selectRoom: async (roomId: number) => {
    const { rooms, selectedUser } = get();
    const roomToSelect = rooms.find(r => r.id === roomId);

    if (!roomToSelect || roomToSelect.isOccupied) {
      return false;
    }

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));

      // Mark the room as occupied by the selected user
      const updatedRooms = rooms.map(r =>
        r.id === roomId ? { ...r, isOccupied: true, occupiedBy: selectedUser } : r
      );

      // Update both the selectedRoom and the rooms array
      set({
        selectedRoom: roomToSelect,
        rooms: updatedRooms,
      });

      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    set({
      selectedUser: '',
      authenticatedUser: null,
      selectedRoom: null,
      currentActivity: null,
    });
  },

  // Cancel activity creation and clear selected room
  cancelActivityCreation: () => {
    set({
      currentActivity: null,
      selectedRoom: null,
    });
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
        set({
          error: 'Keine Authentifizierung für das Laden von Aktivitäten',
          isLoading: false,
        });
        return null;
      }

      if (!authenticatedUser.pin) {
        set({
          error: 'PIN nicht verfügbar. Bitte loggen Sie sich erneut ein.',
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
            activities: activitiesData.map(a => ({ id: a.id, name: a.name, category: a.category_name })),
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
            error: 'Fehler beim Laden der Aktivitäten',
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
