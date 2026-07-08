import { create } from 'zustand';

import {
  type ActivityResponse,
  type Room,
  type CurrentSession,
  type RfidScanResult,
  type DailyFeedbackRating,
} from '../services/api';
import type { SessionRecreationOutcome } from '../services/sessionService';
import { type SessionSettings } from '../services/sessionStorage';
import type { NetworkStatusData } from '../types/network';
import { LogLevel } from '../utils/logger';
import { loggerMiddleware } from '../utils/storeMiddleware';

import { createAuthSlice, type AuthenticatedUser, type User } from './slices/authSlice';
import { createNetworkSlice } from './slices/networkSlice';
import { createRoomSlice } from './slices/roomSlice';
import { createScanSlice, type RecentTagScan, type RfidState } from './slices/scanSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createUiSlice } from './slices/uiSlice';

export { RECENT_SCAN_CACHE_TTL_MS } from './slices/scanSlice';

// Define the store state interface
export interface UserState {
  // State
  users: User[];
  authenticatedUser: AuthenticatedUser | null;
  rooms: Room[];
  selectedRoom: Room | null;
  _roomSelectedAt: number | null; // Timestamp of last manual room selection (race condition guard)
  selectedActivity: ActivityResponse | null;
  currentSession: CurrentSession | null;
  isLoading: boolean;
  error: string | null;
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
  setAuthenticatedUser: (userData: {
    staffId: number;
    staffName: string;
    deviceName: string;
    pin: string;
  }) => void;
  setSelectedActivity: (activity: ActivityResponse) => void;
  setCurrentSession: (session: CurrentSession) => void;
  fetchTeachers: (forceRefresh?: boolean) => Promise<void>;
  fetchRooms: () => Promise<void>;
  selectRoom: (roomId: number) => void;
  fetchCurrentSession: () => Promise<void>;
  logout: () => Promise<void>;

  // Activity-related actions
  fetchActivities: () => Promise<ActivityResponse[] | null>;

  // Supervisor selection actions
  loadSessionSupervisors: () => Promise<void>;
  setSelectedSupervisors: (supervisors: User[]) => void;
  toggleSupervisor: (user: User) => void;
  addSupervisorFromRfid: (staffId: number, staffName: string) => boolean;
  addActiveSupervisorTag: (tagId: string) => void;
  isActiveSupervisor: (tagId: string) => boolean;

  // RFID actions
  startRfidScanning: () => void;
  stopRfidScanning: () => void;
  setScanResult: (result: RfidScanResult | null) => void;
  showScanModal: () => void;
  hideScanModal: () => void;
  startPickupQueryMode: () => void;
  lockPickupQueryTag: (tagId: string) => void;
  resetScanMode: () => void;

  // Duplicate prevention bookkeeping actions
  addToProcessingQueue: (tagId: string) => void;
  removeFromProcessingQueue: (tagId: string) => void;

  // Enhanced duplicate prevention actions
  canProcessTag: (tagId: string) => boolean;
  recordTagScan: (tagId: string, scan: RecentTagScan) => void;
  clearTagScan: (tagId: string) => void;
  clearOldTagScans: () => void;

  // Session settings actions
  loadSessionSettings: () => Promise<void>;
  toggleUseLastSession: (enabled: boolean) => Promise<void>;
  saveLastSessionData: () => Promise<void>;
  validateAndRecreateSession: () => Promise<boolean>;
  recreateSession: () => Promise<SessionRecreationOutcome>;
  invalidateSessionRecreation: () => void;

  // Network status actions
  setNetworkStatus: (status: NetworkStatusData) => void;
  updateNetworkQuality: (quality: NetworkStatusData['quality'], responseTime: number) => void;

  // Daily feedback action
  submitDailyFeedback: (studentId: number, rating: DailyFeedbackRating) => Promise<boolean>;

  // Session state cleanup action
  clearSessionState: () => void;
}

// Define the type for the Zustand set function
export type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
  replace?: false
) => void;

// Define the type for the Zustand get function
export type GetState<T> = () => T;

// Define base store without logging middleware, composed from domain slices
const createUserStore = (set: SetState<UserState>, get: GetState<UserState>) => ({
  ...createAuthSlice(set, get),
  ...createRoomSlice(set, get),
  ...createSessionSlice(set, get),
  ...createScanSlice(set, get),
  ...createUiSlice(),
  ...createNetworkSlice(set),
});

// Create the store with logging middleware
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, {
    name: 'UserStore',
    logLevel: LogLevel.DEBUG,
    stateChanges: true,
    actionSource: true,
    // Exclude certain high-frequency actions to reduce noise
    excludedActions: ['functionalUpdate'],
  })
);

// Expose store for Playwright screenshot automation (dev/test only)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__PYREPORTAL_STORE__ = useUserStore;
}
