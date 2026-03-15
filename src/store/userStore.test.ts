import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  type ActivityResponse,
  type CurrentSession,
  type Room,
  type Teacher,
} from '../services/api';
import {
  clearLastSession,
  loadSessionSettings,
  saveSessionSettings,
  type SessionSettings,
} from '../services/sessionStorage';

import { useUserStore } from './userStore';

// ====================================================================
// Mock api and sessionStorage modules
// ====================================================================

vi.mock('../services/api', () => ({
  api: {
    getTeachers: vi.fn(),
    getActivities: vi.fn(),
    getRooms: vi.fn(),
    getCurrentSession: vi.fn(),
    endSession: vi.fn(),
    submitDailyFeedback: vi.fn(),
  },
  mapServerErrorToGerman: vi.fn((msg: string) => msg),
  isNetworkRelatedError: vi.fn(() => false),
}));

vi.mock('../services/sessionStorage', () => ({
  saveSessionSettings: vi.fn(() => Promise.resolve()),
  loadSessionSettings: vi.fn(() => Promise.resolve(null)),
  clearLastSession: vi.fn(() => Promise.resolve()),
}));

// ====================================================================
// Helper: reset store between tests
// ====================================================================

function resetStore() {
  const store = useUserStore;
  store.setState({
    users: [],
    selectedUser: '',
    selectedUserId: null,
    authenticatedUser: null,
    rooms: [],
    selectedRoom: null,
    _roomSelectedAt: null,
    currentSession: null,
    activities: [],
    selectedActivity: null,
    currentActivity: null,
    isLoading: false,
    error: null,
    nfcScanActive: false,
    selectedSupervisors: [],
    activeSupervisorTags: new Set<string>(),
    sessionSettings: null,
    isValidatingLastSession: false,
    networkStatus: {
      isOnline: true,
      responseTime: 0,
      lastChecked: Date.now(),
      quality: 'online' as const,
    },
    rfid: {
      isScanning: false,
      currentScan: null,
      blockedTags: new Map(),
      showModal: false,
      scanTimeout: 3000,
      modalDisplayTime: 1500,
      optimisticScans: [],
      studentHistory: new Map(),
      processingQueue: new Set(),
      recentTagScans: new Map(),
      tagToStudentMap: new Map(),
    },
  });
}

// Helper to set up an authenticated user
function setAuthenticated(pin = '1234', staffId = 1, staffName = 'Frau Schmidt') {
  useUserStore.getState().setAuthenticatedUser({
    staffId,
    staffName,
    deviceName: 'Pi-5',
    pin,
  });
}

// Helper to create a mock ActivityResponse
function mockActivity(overrides: Partial<ActivityResponse> = {}): ActivityResponse {
  return {
    id: 1,
    name: 'Fußball AG',
    category: 'sport',
    category_name: 'Sport',
    category_color: '#ff0000',
    room_name: 'Turnhalle',
    enrollment_count: 5,
    max_participants: 20,
    has_spots: true,
    supervisor_name: 'Frau Schmidt',
    is_active: true,
    ...overrides,
  };
}

// Helper to create a mock Room
function mockRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 1,
    name: 'Turnhalle',
    is_occupied: false,
    ...overrides,
  };
}

// Typed mock helpers
const mockGetTeachers = vi.mocked(api.getTeachers);
const mockGetActivities = vi.mocked(api.getActivities);
const mockGetRooms = vi.mocked(api.getRooms);
const mockGetCurrentSession = vi.mocked(api.getCurrentSession);
const mockEndSession = vi.mocked(api.endSession);
const mockSubmitDailyFeedback = vi.mocked(api.submitDailyFeedback);
const mockLoadSessionSettings = vi.mocked(loadSessionSettings);
const mockSaveSessionSettings = vi.mocked(saveSessionSettings);
const mockClearLastSession = vi.mocked(clearLastSession);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

// ====================================================================
// Authentication actions
// ====================================================================

describe('Authentication', () => {
  it('sets selected user', () => {
    useUserStore.getState().setSelectedUser('Herr Müller', 42);
    const state = useUserStore.getState();
    expect(state.selectedUser).toBe('Herr Müller');
    expect(state.selectedUserId).toBe(42);
  });

  it('sets authenticated user', () => {
    useUserStore.getState().setAuthenticatedUser({
      staffId: 1,
      staffName: 'Frau Schmidt',
      deviceName: 'Pi-5',
      pin: '1234',
    });
    const auth = useUserStore.getState().authenticatedUser;
    expect(auth).not.toBeNull();
    expect(auth!.staffId).toBe(1);
    expect(auth!.staffName).toBe('Frau Schmidt');
    expect(auth!.pin).toBe('1234');
    expect(auth!.authenticatedAt).toBeDefined();
  });
});

// ====================================================================
// fetchTeachers
// ====================================================================

describe('fetchTeachers', () => {
  const mockTeachers: Teacher[] = [
    { staff_id: 1, display_name: 'Herr Müller' },
    { staff_id: 2, display_name: 'Frau Schmidt' },
  ];

  it('fetches teachers and maps to users', async () => {
    mockGetTeachers.mockResolvedValueOnce(mockTeachers);

    await useUserStore.getState().fetchTeachers();

    const state = useUserStore.getState();
    expect(state.users).toHaveLength(2);
    expect(state.users[0]).toEqual({ id: 1, name: 'Herr Müller' });
    expect(state.users[1]).toEqual({ id: 2, name: 'Frau Schmidt' });
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('skips fetch when already loading', async () => {
    useUserStore.setState({ isLoading: true });

    await useUserStore.getState().fetchTeachers();

    expect(mockGetTeachers).not.toHaveBeenCalled();
  });

  it('skips fetch when users already loaded', async () => {
    useUserStore.setState({ users: [{ id: 1, name: 'Test' }] });

    await useUserStore.getState().fetchTeachers();

    expect(mockGetTeachers).not.toHaveBeenCalled();
  });

  it('forces refresh when forceRefresh is true', async () => {
    useUserStore.setState({ users: [{ id: 1, name: 'Test' }] });
    mockGetTeachers.mockResolvedValueOnce(mockTeachers);

    await useUserStore.getState().fetchTeachers(true);

    expect(mockGetTeachers).toHaveBeenCalled();
    expect(useUserStore.getState().users).toHaveLength(2);
  });

  it('sets error on failure and rethrows', async () => {
    mockGetTeachers.mockRejectedValueOnce(new Error('Network error'));

    await expect(useUserStore.getState().fetchTeachers()).rejects.toThrow('Network error');

    const state = useUserStore.getState();
    expect(state.error).toBe('Network error');
    expect(state.isLoading).toBe(false);
  });
});

// ====================================================================
// fetchRooms
// ====================================================================

describe('fetchRooms', () => {
  const rooms: Room[] = [
    { id: 1, name: 'Turnhalle', is_occupied: false },
    { id: 2, name: 'Raum A', is_occupied: true },
  ];

  it('fetches rooms when authenticated', async () => {
    setAuthenticated();
    mockGetRooms.mockResolvedValueOnce(rooms);

    await useUserStore.getState().fetchRooms();

    const state = useUserStore.getState();
    expect(state.rooms).toHaveLength(2);
    expect(state.isLoading).toBe(false);
  });

  it('sets error when not authenticated', async () => {
    await useUserStore.getState().fetchRooms();

    const state = useUserStore.getState();
    expect(state.error).toBeTruthy();
    expect(mockGetRooms).not.toHaveBeenCalled();
  });

  it('sets error on API failure', async () => {
    setAuthenticated();
    mockGetRooms.mockRejectedValueOnce(new Error('Server error'));

    await useUserStore.getState().fetchRooms();

    const state = useUserStore.getState();
    expect(state.error).toBe('Server error');
    expect(state.isLoading).toBe(false);
  });
});

// ====================================================================
// Room selection
// ====================================================================

describe('Room selection', () => {
  it('selects a room by ID', () => {
    const rooms = [
      { id: 1, name: 'Turnhalle', is_occupied: false },
      { id: 2, name: 'Raum A', is_occupied: false },
    ];
    useUserStore.setState({ rooms });

    useUserStore.getState().selectRoom(2);
    const state = useUserStore.getState();
    expect(state.selectedRoom).not.toBeNull();
    expect(state.selectedRoom!.name).toBe('Raum A');
    expect(state._roomSelectedAt).toBeGreaterThan(0);
  });

  it('ignores non-existent room ID', () => {
    useUserStore.setState({
      rooms: [{ id: 1, name: 'Turnhalle', is_occupied: false }],
    });
    useUserStore.getState().selectRoom(999);
    expect(useUserStore.getState().selectedRoom).toBeNull();
  });
});

// ====================================================================
// fetchCurrentSession
// ====================================================================

describe('fetchCurrentSession', () => {
  it('does nothing when not authenticated', async () => {
    await useUserStore.getState().fetchCurrentSession();
    expect(mockGetCurrentSession).not.toHaveBeenCalled();
  });

  it('clears session state when no active session', async () => {
    setAuthenticated();
    mockGetCurrentSession.mockResolvedValueOnce(null);

    // Set some session state first
    useUserStore.setState({
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      } as CurrentSession,
    });

    await useUserStore.getState().fetchCurrentSession();

    expect(useUserStore.getState().currentSession).toBeNull();
  });

  it('restores session with activity and room data', async () => {
    setAuthenticated();
    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      activity_name: 'Fußball AG',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      room_id: 5,
      room_name: 'Turnhalle',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);

    const activities = [mockActivity({ id: 10, name: 'Fußball AG' })];
    mockGetActivities.mockResolvedValueOnce(activities);

    await useUserStore.getState().fetchCurrentSession();

    const state = useUserStore.getState();
    expect(state.currentSession).toEqual(session);
    expect(state.selectedActivity).not.toBeNull();
    expect(state.selectedActivity!.id).toBe(10);
    expect(state.selectedRoom).not.toBeNull();
    expect(state.selectedRoom!.name).toBe('Turnhalle');
  });

  it('handles API error gracefully', async () => {
    setAuthenticated();
    mockGetCurrentSession.mockRejectedValueOnce(new Error('Server down'));

    await useUserStore.getState().fetchCurrentSession();

    // Should not set error state, just log it
    expect(useUserStore.getState().error).toBeNull();
  });

  it('restores supervisors from session', async () => {
    setAuthenticated();
    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      activity_name: 'Test',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      room_id: 5,
      room_name: 'Raum A',
      is_active: true,
      supervisors: [
        { staff_id: 1, display_name: 'Herr Test' },
        { staff_id: 2, display_name: 'Frau Test' },
      ],
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);
    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10, name: 'Test' })]);

    await useUserStore.getState().fetchCurrentSession();

    const supervisors = useUserStore.getState().selectedSupervisors;
    expect(supervisors).toHaveLength(2);
    expect(supervisors[0]).toEqual({ id: 1, name: 'Herr Test' });
  });

  it('preserves manually selected room during recent selection', async () => {
    setAuthenticated();
    const manualRoom = { id: 99, name: 'Manual Room', is_occupied: false };
    useUserStore.setState({
      selectedRoom: manualRoom,
      _roomSelectedAt: Date.now(), // just selected
    });

    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      activity_name: 'Test',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      room_id: 5,
      room_name: 'Server Room',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);
    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10, name: 'Test' })]);

    await useUserStore.getState().fetchCurrentSession();

    // Should preserve the manual room, not overwrite with server room
    expect(useUserStore.getState().selectedRoom!.id).toBe(99);
  });

  it('uses fallback activity when activity not found in API response', async () => {
    setAuthenticated();
    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 999, // ID that won't match
      activity_name: 'Deleted Activity',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);
    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 1 })]); // Different ID

    await useUserStore.getState().fetchCurrentSession();

    const selectedActivity = useUserStore.getState().selectedActivity;
    expect(selectedActivity).not.toBeNull();
    expect(selectedActivity!.id).toBe(999);
    expect(selectedActivity!.name).toBe('Deleted Activity');
  });

  it('uses fallback activity when API call fails', async () => {
    setAuthenticated();
    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      activity_name: 'Test Activity',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);
    mockGetActivities.mockRejectedValueOnce(new Error('API error'));

    await useUserStore.getState().fetchCurrentSession();

    const selectedActivity = useUserStore.getState().selectedActivity;
    expect(selectedActivity).not.toBeNull();
    expect(selectedActivity!.id).toBe(10);
    expect(selectedActivity!.name).toBe('Test Activity');
  });

  it('preserves existing selectedActivity when IDs match', async () => {
    setAuthenticated();
    const existingActivity = mockActivity({ id: 10, name: 'Existing', max_participants: 100 });
    useUserStore.setState({ selectedActivity: existingActivity });

    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      activity_name: 'Existing',
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);

    await useUserStore.getState().fetchCurrentSession();

    // Should NOT call getActivities since we already have the matching activity
    expect(mockGetActivities).not.toHaveBeenCalled();
    expect(useUserStore.getState().selectedActivity!.max_participants).toBe(100);
  });

  it('returns null activity when session has no activity_name', async () => {
    setAuthenticated();
    const session: CurrentSession = {
      active_group_id: 1,
      activity_id: 10,
      // no activity_name
      device_id: 1,
      start_time: '2024-01-01T10:00:00Z',
      duration: '2h',
      is_active: true,
    };
    mockGetCurrentSession.mockResolvedValueOnce(session);

    await useUserStore.getState().fetchCurrentSession();

    expect(useUserStore.getState().selectedActivity).toBeNull();
  });
});

// ====================================================================
// logout
// ====================================================================

describe('logout', () => {
  it('clears all auth and session state', async () => {
    setAuthenticated();
    useUserStore.setState({
      selectedUser: 'Herr Müller',
      selectedUserId: 1,
      selectedRoom: mockRoom(),
      selectedActivity: mockActivity(),
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      } as CurrentSession,
      selectedSupervisors: [{ id: 1, name: 'Test' }],
    });

    mockEndSession.mockResolvedValueOnce(undefined);

    await useUserStore.getState().logout();

    const state = useUserStore.getState();
    expect(state.authenticatedUser).toBeNull();
    expect(state.selectedUser).toBe('');
    expect(state.selectedUserId).toBeNull();
    expect(state.selectedRoom).toBeNull();
    expect(state.selectedActivity).toBeNull();
    expect(state.currentSession).toBeNull();
    expect(state.selectedSupervisors).toHaveLength(0);
  });

  it('ends current session before logging out', async () => {
    setAuthenticated();
    useUserStore.setState({
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      } as CurrentSession,
    });
    mockEndSession.mockResolvedValueOnce(undefined);

    await useUserStore.getState().logout();

    expect(mockEndSession).toHaveBeenCalledWith('1234');
  });

  it('continues logout even if endSession fails', async () => {
    setAuthenticated();
    useUserStore.setState({
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      } as CurrentSession,
    });
    mockEndSession.mockRejectedValueOnce(new Error('Network error'));

    await useUserStore.getState().logout();

    expect(useUserStore.getState().authenticatedUser).toBeNull();
  });

  it('skips session end when no current session', async () => {
    setAuthenticated();

    await useUserStore.getState().logout();

    expect(mockEndSession).not.toHaveBeenCalled();
    expect(useUserStore.getState().authenticatedUser).toBeNull();
  });
});

// ====================================================================
// Supervisor selection
// ====================================================================

describe('Supervisor selection', () => {
  const user1 = { id: 1, name: 'Herr Müller' };
  const user2 = { id: 2, name: 'Frau Schmidt' };

  it('toggles supervisor on', () => {
    useUserStore.getState().toggleSupervisor(user1);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(1);
    expect(useUserStore.getState().selectedSupervisors[0].name).toBe('Herr Müller');
  });

  it('toggles supervisor off', () => {
    useUserStore.getState().toggleSupervisor(user1);
    useUserStore.getState().toggleSupervisor(user1);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(0);
  });

  it('manages multiple supervisors', () => {
    useUserStore.getState().toggleSupervisor(user1);
    useUserStore.getState().toggleSupervisor(user2);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(2);
  });

  it('sets supervisors directly', () => {
    useUserStore.getState().setSelectedSupervisors([user1, user2]);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(2);
  });

  it('clears supervisors', () => {
    useUserStore.getState().setSelectedSupervisors([user1]);
    useUserStore.getState().clearSelectedSupervisors();
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(0);
  });

  it('addSupervisorFromRfid adds new supervisor', () => {
    useUserStore.setState({ users: [{ id: 10, name: 'Max Müller' }] });
    const alreadyPresent = useUserStore.getState().addSupervisorFromRfid(10, 'Max Müller');
    expect(alreadyPresent).toBe(false);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(1);
  });

  it('addSupervisorFromRfid returns true if already present', () => {
    useUserStore.setState({ selectedSupervisors: [{ id: 10, name: 'Max Müller' }] });
    const result = useUserStore.getState().addSupervisorFromRfid(10, 'Max Müller');
    expect(result).toBe(true);
  });

  it('manages active supervisor tags', () => {
    useUserStore.getState().addActiveSupervisorTag('04:AA:BB:CC');
    expect(useUserStore.getState().isActiveSupervisor('04:AA:BB:CC')).toBe(true);
    expect(useUserStore.getState().isActiveSupervisor('04:XX:YY:ZZ')).toBe(false);

    useUserStore.getState().clearActiveSupervisorTags();
    expect(useUserStore.getState().isActiveSupervisor('04:AA:BB:CC')).toBe(false);
  });
});

// ====================================================================
// RFID scanning state
// ====================================================================

describe('RFID scanning state', () => {
  it('starts and stops scanning', () => {
    useUserStore.getState().startRfidScanning();
    expect(useUserStore.getState().rfid.isScanning).toBe(true);

    useUserStore.getState().stopRfidScanning();
    expect(useUserStore.getState().rfid.isScanning).toBe(false);
  });

  it('sets and clears scan result', () => {
    const result = {
      student_name: 'Max',
      action: 'checked_in' as const,
      student_id: 1,
      group_name: 'Gruppe A',
    };
    useUserStore.getState().setScanResult(result);
    expect(useUserStore.getState().rfid.currentScan).toEqual(result);

    useUserStore.getState().setScanResult(null);
    expect(useUserStore.getState().rfid.currentScan).toBeNull();
  });

  it('shows and hides scan modal', () => {
    useUserStore.getState().showScanModal();
    expect(useUserStore.getState().rfid.showModal).toBe(true);

    useUserStore.getState().hideScanModal();
    expect(useUserStore.getState().rfid.showModal).toBe(false);
    expect(useUserStore.getState().rfid.currentScan).toBeNull();
  });
});

// ====================================================================
// Tag blocking
// ====================================================================

describe('Tag blocking', () => {
  it('blocks a tag for given duration', () => {
    useUserStore.getState().blockTag('04:AA:BB', 5000);
    expect(useUserStore.getState().isTagBlocked('04:AA:BB')).toBe(true);
  });

  it('returns false for unblocked tag', () => {
    expect(useUserStore.getState().isTagBlocked('04:XX:YY')).toBe(false);
  });

  it('clears a blocked tag', () => {
    useUserStore.getState().blockTag('04:AA:BB', 5000);
    useUserStore.getState().clearBlockedTag('04:AA:BB');
    expect(useUserStore.getState().isTagBlocked('04:AA:BB')).toBe(false);
  });

  it('auto-clears expired block on check', () => {
    // Block with 0 duration (immediately expired)
    useUserStore.getState().blockTag('04:AA:BB', -1);
    expect(useUserStore.getState().isTagBlocked('04:AA:BB')).toBe(false);
    // Should have been cleaned up
    expect(useUserStore.getState().rfid.blockedTags.has('04:AA:BB')).toBe(false);
  });
});

// ====================================================================
// Duplicate prevention — canProcessTag (3-layer)
// ====================================================================

describe('canProcessTag (duplicate prevention)', () => {
  it('allows new tag', () => {
    expect(useUserStore.getState().canProcessTag('04:NEW:TAG')).toBe(true);
  });

  it('blocks tag in processing queue (Layer 1)', () => {
    useUserStore.getState().addToProcessingQueue('04:AA:BB');
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(false);
  });

  it('allows tag after removing from processing queue', () => {
    useUserStore.getState().addToProcessingQueue('04:AA:BB');
    useUserStore.getState().removeFromProcessingQueue('04:AA:BB');
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(true);
  });

  it('blocks recently scanned tag (Layer 2)', () => {
    useUserStore.getState().recordTagScan('04:AA:BB', { timestamp: Date.now() });
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(false);
  });

  it('allows tag after scan expires (Layer 2)', () => {
    useUserStore.getState().recordTagScan('04:AA:BB', { timestamp: Date.now() - 3000 });
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(true);
  });

  it('checks student history when tag is mapped (Layer 3)', () => {
    // Map tag to student and set student as processing with opposite action
    // canProcessTag calls isValidStudentScan with 'checkin', so we set lastAction to 'checkout'
    // to simulate an opposite action that should be blocked when processing
    useUserStore.getState().mapTagToStudent('04:AA:BB', 'student-1');
    useUserStore.setState(state => ({
      rfid: {
        ...state.rfid,
        studentHistory: new Map([
          [
            'student-1',
            {
              studentId: 'student-1',
              lastAction: 'checkout' as const,
              timestamp: Date.now(),
              isProcessing: true,
            },
          ],
        ]),
      },
    }));

    // Should block because student is processing with opposite action (checkout vs checkin)
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(false);
  });
});

// ====================================================================
// Tag-to-student mapping
// ====================================================================

describe('Tag-to-student mapping', () => {
  it('maps and retrieves tag to student', () => {
    useUserStore.getState().mapTagToStudent('04:AA:BB', 'student-123');
    expect(useUserStore.getState().getCachedStudentId('04:AA:BB')).toBe('student-123');
  });

  it('returns undefined for unmapped tag', () => {
    expect(useUserStore.getState().getCachedStudentId('04:XX:YY')).toBeUndefined();
  });

  it('clearTagScan removes scan, mapping, and student history', () => {
    useUserStore.getState().recordTagScan('04:AA:BB', { timestamp: Date.now() });
    useUserStore.getState().mapTagToStudent('04:AA:BB', 'student-123');
    useUserStore.getState().updateStudentHistory('student-123', 'checkin');

    useUserStore.getState().clearTagScan('04:AA:BB');
    expect(useUserStore.getState().getCachedStudentId('04:AA:BB')).toBeUndefined();
    expect(useUserStore.getState().rfid.recentTagScans.has('04:AA:BB')).toBe(false);
    expect(useUserStore.getState().rfid.studentHistory.has('student-123')).toBe(false);
  });
});

// ====================================================================
// Student history and scan validation
// ====================================================================

describe('Student scan validation (Layer 3)', () => {
  it('allows first scan for a student', () => {
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkin')).toBe(true);
  });

  it('allows same action when not processing (idempotent)', () => {
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkin')).toBe(true);
  });

  it('blocks opposite action when processing', () => {
    useUserStore.setState(state => ({
      rfid: {
        ...state.rfid,
        studentHistory: new Map([
          [
            'student-1',
            {
              studentId: 'student-1',
              lastAction: 'checkin' as const,
              timestamp: Date.now(),
              isProcessing: true,
            },
          ],
        ]),
      },
    }));
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkout')).toBe(false);
  });

  it('allows opposite action when not processing', () => {
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkout')).toBe(true);
  });

  it('allows opposite action when processing but expired (>10s)', () => {
    useUserStore.setState(state => ({
      rfid: {
        ...state.rfid,
        studentHistory: new Map([
          [
            'student-1',
            {
              studentId: 'student-1',
              lastAction: 'checkin' as const,
              timestamp: Date.now() - 15000, // 15s ago
              isProcessing: true,
            },
          ],
        ]),
      },
    }));
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkout')).toBe(true);
  });
});

// ====================================================================
// isValidScan (alias for isValidStudentScan)
// ====================================================================

describe('isValidScan', () => {
  it('allows first scan', () => {
    expect(useUserStore.getState().isValidScan('student-1', 'checkin')).toBe(true);
  });

  it('allows same action (idempotent)', () => {
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');
    expect(useUserStore.getState().isValidScan('student-1', 'checkin')).toBe(true);
  });

  it('blocks opposite action when processing and recent', () => {
    useUserStore.setState(state => ({
      rfid: {
        ...state.rfid,
        studentHistory: new Map([
          [
            'student-1',
            {
              studentId: 'student-1',
              lastAction: 'checkin' as const,
              timestamp: Date.now(),
              isProcessing: true,
            },
          ],
        ]),
      },
    }));
    expect(useUserStore.getState().isValidScan('student-1', 'checkout')).toBe(false);
  });

  it('allows opposite action when not processing', () => {
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');
    expect(useUserStore.getState().isValidScan('student-1', 'checkout')).toBe(true);
  });
});

// ====================================================================
// Optimistic scans
// ====================================================================

describe('Optimistic scans', () => {
  it('adds and removes optimistic scan', () => {
    useUserStore.getState().addOptimisticScan({
      id: 'scan-1',
      tagId: '04:AA:BB',
      status: 'pending',
      optimisticAction: 'checkin',
      optimisticStudentCount: 5,
      timestamp: Date.now(),
    });
    expect(useUserStore.getState().rfid.optimisticScans).toHaveLength(1);

    useUserStore.getState().removeOptimisticScan('scan-1');
    expect(useUserStore.getState().rfid.optimisticScans).toHaveLength(0);
  });

  it('updates optimistic scan status', () => {
    useUserStore.getState().addOptimisticScan({
      id: 'scan-1',
      tagId: '04:AA:BB',
      status: 'pending',
      optimisticAction: 'checkin',
      optimisticStudentCount: 5,
      timestamp: Date.now(),
    });
    useUserStore.getState().updateOptimisticScan('scan-1', 'success');
    expect(useUserStore.getState().rfid.optimisticScans[0].status).toBe('success');
  });
});

// ====================================================================
// Processing queue
// ====================================================================

describe('Processing queue', () => {
  it('adds and removes from processing queue', () => {
    useUserStore.getState().addToProcessingQueue('04:AA:BB');
    expect(useUserStore.getState().rfid.processingQueue.has('04:AA:BB')).toBe(true);

    useUserStore.getState().removeFromProcessingQueue('04:AA:BB');
    expect(useUserStore.getState().rfid.processingQueue.has('04:AA:BB')).toBe(false);
  });
});

// ====================================================================
// Network status
// ====================================================================

describe('Network status', () => {
  it('updates network quality', () => {
    useUserStore.getState().updateNetworkQuality('online', 150);
    const status = useUserStore.getState().networkStatus;
    expect(status.quality).toBe('online');
    expect(status.responseTime).toBe(150);
    expect(status.isOnline).toBe(true);
  });

  it('sets offline quality correctly', () => {
    useUserStore.getState().updateNetworkQuality('offline', 0);
    const status = useUserStore.getState().networkStatus;
    expect(status.quality).toBe('offline');
    expect(status.isOnline).toBe(false);
  });

  it('sets full network status', () => {
    useUserStore.getState().setNetworkStatus({
      quality: 'offline',
      responseTime: 0,
      isOnline: false,
      lastChecked: Date.now(),
    });
    expect(useUserStore.getState().networkStatus.quality).toBe('offline');
  });
});

// ====================================================================
// NFC scan control
// ====================================================================

describe('NFC scan', () => {
  it('starts and stops NFC scan', () => {
    useUserStore.getState().startNfcScan();
    expect(useUserStore.getState().nfcScanActive).toBe(true);

    useUserStore.getState().stopNfcScan();
    expect(useUserStore.getState().nfcScanActive).toBe(false);
  });

  // Note: startNfcScan and stopNfcScan use closure-based guards with setTimeout(0)
  // to prevent re-entrant calls. Testing the guard behavior requires waiting for
  // the setTimeout to fire between calls, which is done in the start/stop test above.
});

// ====================================================================
// clearOldTagScans
// ====================================================================

describe('clearOldTagScans', () => {
  it('removes scans older than 2 seconds', () => {
    useUserStore.getState().recordTagScan('old-tag', { timestamp: Date.now() - 5000 });
    useUserStore.getState().recordTagScan('new-tag', { timestamp: Date.now() });

    useUserStore.getState().clearOldTagScans();
    expect(useUserStore.getState().rfid.recentTagScans.has('old-tag')).toBe(false);
    expect(useUserStore.getState().rfid.recentTagScans.has('new-tag')).toBe(true);
  });
});

// ====================================================================
// Activity management (sync parts)
// ====================================================================

describe('Activity management', () => {
  it('sets selected activity', () => {
    const activity = { id: 1, name: 'Fußball AG', category: 'Sport' };
    useUserStore.getState().setSelectedActivity(activity as ActivityResponse);
    expect(useUserStore.getState().selectedActivity).toEqual(activity);
  });

  it('initializes activity with room ID', () => {
    useUserStore.getState().initializeActivity(5);
    const current = useUserStore.getState().currentActivity;
    expect(current).not.toBeNull();
    expect(current!.roomId).toBe(5);
  });

  it('initializes activity with creator from selectedUser', () => {
    useUserStore.setState({
      selectedUser: 'Herr Müller',
      users: [{ id: 42, name: 'Herr Müller' }],
    });
    useUserStore.getState().initializeActivity(5);
    const current = useUserStore.getState().currentActivity;
    expect(current!.supervisorId).toBe(42);
    expect(current!.createdBy).toBe('Herr Müller');
  });

  it('cancels activity creation', () => {
    useUserStore.getState().initializeActivity(5);
    useUserStore.getState().cancelActivityCreation();
    expect(useUserStore.getState().currentActivity).toBeNull();
    expect(useUserStore.getState().selectedRoom).toBeNull();
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(0);
  });

  it('updates activity field', () => {
    useUserStore.getState().initializeActivity(5);
    useUserStore.getState().updateActivityField('name', 'Test Activity');
    expect(useUserStore.getState().currentActivity!.name).toBe('Test Activity');
  });

  it('logs specially when updating name field', () => {
    useUserStore.getState().initializeActivity(5);
    useUserStore.getState().updateActivityField('name', 'New Name');
    expect(useUserStore.getState().currentActivity!.name).toBe('New Name');
  });

  it('does nothing when updating field without current activity', () => {
    useUserStore.getState().updateActivityField('name', 'Test');
    expect(useUserStore.getState().currentActivity).toBeNull();
  });
});

// ====================================================================
// createActivity
// ====================================================================

describe('createActivity', () => {
  it('creates activity with valid fields', async () => {
    useUserStore.setState({
      selectedUser: 'Herr Müller',
      users: [{ id: 1, name: 'Herr Müller' }],
      selectedRoom: mockRoom(),
    });
    useUserStore.getState().initializeActivity(1);
    useUserStore.getState().updateActivityField('name', 'Test AG');

    const result = await useUserStore.getState().createActivity();

    expect(result).toBe(true);
    expect(useUserStore.getState().activities.length).toBeGreaterThan(0);
    expect(useUserStore.getState().currentActivity).toBeNull();
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('returns false when required fields are missing', async () => {
    // No currentActivity set
    const result = await useUserStore.getState().createActivity();

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('returns false when name is missing', async () => {
    useUserStore.setState({
      selectedRoom: mockRoom(),
    });
    useUserStore.getState().initializeActivity(1);
    // Don't set a name (it's initialized as empty string)

    const result = await useUserStore.getState().createActivity();

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBe('Bitte fülle alle Pflichtfelder aus');
  });
});

// ====================================================================
// fetchActivities
// ====================================================================

describe('fetchActivities', () => {
  it('fetches activities when authenticated', async () => {
    setAuthenticated();
    const activities = [mockActivity({ id: 1 }), mockActivity({ id: 2, name: 'Kunst AG' })];
    mockGetActivities.mockResolvedValueOnce(activities);

    const result = await useUserStore.getState().fetchActivities();

    expect(result).toEqual(activities);
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('returns null when not authenticated', async () => {
    const result = await useUserStore.getState().fetchActivities();

    expect(result).toBeNull();
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('returns null when no PIN', async () => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test',
        deviceName: 'Pi-5',
        pin: '',
        authenticatedAt: new Date(),
      },
    });

    const result = await useUserStore.getState().fetchActivities();

    expect(result).toBeNull();
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('returns null on API error', async () => {
    setAuthenticated();
    mockGetActivities.mockRejectedValueOnce(new Error('API error'));

    const result = await useUserStore.getState().fetchActivities();

    expect(result).toBeNull();
    expect(useUserStore.getState().error).toBe('API error');
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  // Note: Testing deduplication (fetchPromise reuse) is tricky because the IIFE closure
  // captures fetchPromise. We can still test that it doesn't crash on concurrent calls.
  it('handles concurrent calls without errors', async () => {
    setAuthenticated();
    const activities = [mockActivity()];
    mockGetActivities.mockResolvedValue(activities);

    const [r1, r2] = await Promise.all([
      useUserStore.getState().fetchActivities(),
      useUserStore.getState().fetchActivities(),
    ]);

    // Both should resolve (second may return deduped promise)
    expect(r1).toEqual(activities);
    expect(r2).toEqual(activities);
  });
});

// ====================================================================
// checkInStudent
// ====================================================================

describe('checkInStudent', () => {
  it('checks in a student to an activity', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
        },
      ],
    });

    const result = await useUserStore.getState().checkInStudent(1, {
      id: 10,
      name: 'Max Mustermann',
      checkOutTime: undefined,
    });

    expect(result).toBe(true);
    const activity = useUserStore.getState().activities[0];
    expect(activity.checkedInStudents).toHaveLength(1);
    expect(activity.checkedInStudents![0].isCheckedIn).toBe(true);
  });

  it('returns false when activity not found', async () => {
    const result = await useUserStore.getState().checkInStudent(999, {
      id: 10,
      name: 'Max',
      checkOutTime: undefined,
    });

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('returns false when student already checked in', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [{ id: 10, name: 'Max', isCheckedIn: true }],
        },
      ],
    });

    const result = await useUserStore.getState().checkInStudent(1, {
      id: 10,
      name: 'Max',
      checkOutTime: undefined,
    });

    expect(result).toBe(false);
  });

  it('re-checks in a previously checked-out student', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [
            { id: 10, name: 'Max', isCheckedIn: false, checkOutTime: new Date() },
          ],
        },
      ],
    });

    const result = await useUserStore.getState().checkInStudent(1, {
      id: 10,
      name: 'Max',
      checkOutTime: undefined,
    });

    expect(result).toBe(true);
    const student = useUserStore.getState().activities[0].checkedInStudents![0];
    expect(student.isCheckedIn).toBe(true);
    expect(student.checkOutTime).toBeUndefined();
  });
});

// ====================================================================
// checkOutStudent
// ====================================================================

describe('checkOutStudent', () => {
  it('checks out a student from an activity', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [{ id: 10, name: 'Max', isCheckedIn: true }],
        },
      ],
    });

    const result = await useUserStore.getState().checkOutStudent(1, 10);

    expect(result).toBe(true);
    const student = useUserStore.getState().activities[0].checkedInStudents![0];
    expect(student.isCheckedIn).toBe(false);
    expect(student.checkOutTime).toBeDefined();
  });

  it('returns false when activity not found', async () => {
    const result = await useUserStore.getState().checkOutStudent(999, 10);

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('returns false when no students are checked in', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [],
        },
      ],
    });

    const result = await useUserStore.getState().checkOutStudent(1, 10);

    expect(result).toBe(false);
  });

  it('returns false when student not checked in', async () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [{ id: 10, name: 'Max', isCheckedIn: false }],
        },
      ],
    });

    const result = await useUserStore.getState().checkOutStudent(1, 10);

    expect(result).toBe(false);
  });
});

// ====================================================================
// getActivityStudents
// ====================================================================

describe('getActivityStudents', () => {
  it('returns checked-in students for an activity', () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
          checkedInStudents: [{ id: 10, name: 'Max', isCheckedIn: true }],
        },
      ],
    });

    const students = useUserStore.getState().getActivityStudents(1);
    expect(students).toHaveLength(1);
    expect(students[0].name).toBe('Max');
  });

  it('returns mock students when activity has no checkedInStudents', () => {
    useUserStore.setState({
      activities: [
        {
          id: 1,
          name: 'Test AG',
          category: 'Sport' as never,
          roomId: 1,
          supervisorId: 1,
          createdBy: 'Test',
          createdAt: new Date(),
        },
      ],
    });

    const students = useUserStore.getState().getActivityStudents(1);
    // Should return mock students
    expect(students.length).toBeGreaterThan(0);
  });

  it('returns mock students when activity not found', () => {
    const students = useUserStore.getState().getActivityStudents(999);
    expect(students.length).toBeGreaterThan(0);
  });
});

// ====================================================================
// Session settings
// ====================================================================

describe('loadSessionSettings', () => {
  it('loads settings from storage', async () => {
    const settings: SessionSettings = {
      use_last_session: true,
      auto_save_enabled: true,
      last_session: null,
    };
    mockLoadSessionSettings.mockResolvedValueOnce(settings);

    await useUserStore.getState().loadSessionSettings();

    expect(useUserStore.getState().sessionSettings).toEqual(settings);
  });

  it('handles null settings gracefully', async () => {
    mockLoadSessionSettings.mockResolvedValueOnce(null);

    await useUserStore.getState().loadSessionSettings();

    expect(useUserStore.getState().sessionSettings).toBeNull();
  });

  it('handles error gracefully', async () => {
    mockLoadSessionSettings.mockRejectedValueOnce(new Error('Storage error'));

    await useUserStore.getState().loadSessionSettings();

    // Should not throw, just log
    expect(useUserStore.getState().sessionSettings).toBeNull();
  });
});

describe('toggleUseLastSession', () => {
  it('toggles use_last_session on', async () => {
    mockSaveSessionSettings.mockResolvedValueOnce(undefined);

    await useUserStore.getState().toggleUseLastSession(true);

    const settings = useUserStore.getState().sessionSettings;
    expect(settings).not.toBeNull();
    expect(settings!.use_last_session).toBe(true);
    expect(mockSaveSessionSettings).toHaveBeenCalled();
  });

  it('toggles use_last_session off', async () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: {
          activity_id: 1,
          room_id: 1,
          supervisor_ids: [1],
          saved_at: 'now',
          activity_name: 'a',
          room_name: 'r',
          supervisor_names: ['s'],
        },
      },
    });
    mockSaveSessionSettings.mockResolvedValueOnce(undefined);

    await useUserStore.getState().toggleUseLastSession(false);

    const settings = useUserStore.getState().sessionSettings;
    expect(settings!.use_last_session).toBe(false);
    // Should preserve existing last_session
    expect(settings!.last_session).not.toBeNull();
  });

  it('handles save error gracefully', async () => {
    mockSaveSessionSettings.mockRejectedValueOnce(new Error('Save failed'));

    await useUserStore.getState().toggleUseLastSession(true);

    // Should not throw, settings should remain unchanged
    expect(useUserStore.getState().sessionSettings).toBeNull();
  });
});

describe('saveLastSessionData', () => {
  it('saves session data when all required fields present', async () => {
    useUserStore.setState({
      selectedActivity: mockActivity({ id: 5, name: 'Kunst AG' }),
      selectedRoom: mockRoom({ id: 3, name: 'Raum B' }),
      selectedSupervisors: [{ id: 1, name: 'Herr Test' }],
      sessionSettings: { use_last_session: true, auto_save_enabled: true, last_session: null },
    });
    mockSaveSessionSettings.mockResolvedValueOnce(undefined);

    await useUserStore.getState().saveLastSessionData();

    expect(mockSaveSessionSettings).toHaveBeenCalled();
    const savedSettings = mockSaveSessionSettings.mock.calls[0][0];
    expect(savedSettings.last_session!.activity_id).toBe(5);
    expect(savedSettings.last_session!.room_id).toBe(3);
    expect(savedSettings.last_session!.supervisor_ids).toEqual([1]);
  });

  it('does nothing when activity is missing', async () => {
    useUserStore.setState({
      selectedRoom: mockRoom(),
      selectedSupervisors: [{ id: 1, name: 'Test' }],
    });

    await useUserStore.getState().saveLastSessionData();

    expect(mockSaveSessionSettings).not.toHaveBeenCalled();
  });

  it('does nothing when room is missing', async () => {
    useUserStore.setState({
      selectedActivity: mockActivity(),
      selectedSupervisors: [{ id: 1, name: 'Test' }],
    });

    await useUserStore.getState().saveLastSessionData();

    expect(mockSaveSessionSettings).not.toHaveBeenCalled();
  });

  it('does nothing when no supervisors', async () => {
    useUserStore.setState({
      selectedActivity: mockActivity(),
      selectedRoom: mockRoom(),
      selectedSupervisors: [],
    });

    await useUserStore.getState().saveLastSessionData();

    expect(mockSaveSessionSettings).not.toHaveBeenCalled();
  });

  it('handles save error gracefully', async () => {
    useUserStore.setState({
      selectedActivity: mockActivity(),
      selectedRoom: mockRoom(),
      selectedSupervisors: [{ id: 1, name: 'Test' }],
    });
    mockSaveSessionSettings.mockRejectedValueOnce(new Error('Save failed'));

    await useUserStore.getState().saveLastSessionData();

    // Should not throw
  });
});

// ====================================================================
// validateAndRecreateSession
// ====================================================================

describe('validateAndRecreateSession', () => {
  const lastSession = {
    activity_id: 10,
    room_id: 5,
    supervisor_ids: [1, 2],
    saved_at: '2024-01-01',
    activity_name: 'Fußball AG',
    room_name: 'Turnhalle',
    supervisor_names: ['Herr A', 'Frau B'],
  };

  it('returns false when no saved session', async () => {
    setAuthenticated();

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(false);
  });

  it('returns false when not authenticated', async () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(false);
  });

  it('validates and restores session successfully', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
      users: [
        { id: 1, name: 'Herr A' },
        { id: 2, name: 'Frau B' },
      ],
    });

    const activities = [mockActivity({ id: 10, name: 'Fußball AG' })];
    const rooms = [mockRoom({ id: 5, name: 'Turnhalle' })];
    mockGetActivities.mockResolvedValueOnce(activities);
    mockGetRooms.mockResolvedValueOnce(rooms);

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(true);
    expect(useUserStore.getState().selectedActivity!.id).toBe(10);
    expect(useUserStore.getState().selectedRoom!.id).toBe(5);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(2);
    expect(useUserStore.getState().isValidatingLastSession).toBe(false);
  });

  it('uses already-selected supervisors if present', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
      selectedSupervisors: [{ id: 99, name: 'Already Selected' }],
    });

    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10 })]);
    mockGetRooms.mockResolvedValueOnce([mockRoom({ id: 5 })]);

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(true);
    expect(useUserStore.getState().selectedSupervisors).toHaveLength(1);
    expect(useUserStore.getState().selectedSupervisors[0].id).toBe(99);
  });

  it('returns false when activity not found', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });

    mockGetActivities.mockResolvedValueOnce([]); // Empty - no match

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
    expect(mockClearLastSession).toHaveBeenCalled();
  });

  it('returns false when room not found', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });

    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10 })]);
    mockGetRooms.mockResolvedValueOnce([]); // Empty - no match

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('fetches teachers when users not loaded for supervisor resolution', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
      users: [], // No users loaded
    });

    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10 })]);
    mockGetRooms.mockResolvedValueOnce([mockRoom({ id: 5 })]);
    // fetchTeachers will be called internally
    mockGetTeachers.mockResolvedValueOnce([
      { staff_id: 1, display_name: 'Herr A' },
      { staff_id: 2, display_name: 'Frau B' },
    ]);

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(true);
    expect(mockGetTeachers).toHaveBeenCalled();
  });

  it('returns false when supervisor resolution fails', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: {
          ...lastSession,
          supervisor_ids: [999], // Non-existent supervisor
        },
      },
      users: [{ id: 1, name: 'Other User' }], // Doesn't match supervisor_ids
    });

    mockGetActivities.mockResolvedValueOnce([mockActivity({ id: 10 })]);
    mockGetRooms.mockResolvedValueOnce([mockRoom({ id: 5 })]);

    const result = await useUserStore.getState().validateAndRecreateSession();

    expect(result).toBe(false);
    expect(useUserStore.getState().error).toBeTruthy();
  });

  it('clears session settings on validation failure', async () => {
    setAuthenticated();
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });

    mockGetActivities.mockResolvedValueOnce([]); // Activity not found
    mockClearLastSession.mockResolvedValueOnce(undefined);

    await useUserStore.getState().validateAndRecreateSession();

    const settings = useUserStore.getState().sessionSettings;
    expect(settings!.last_session).toBeNull();
    expect(settings!.use_last_session).toBe(false);
  });
});

// ====================================================================
// clearSessionSettings
// ====================================================================

describe('clearSessionSettings', () => {
  it('clears session settings', async () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: {
          activity_id: 1,
          room_id: 1,
          supervisor_ids: [1],
          saved_at: 'now',
          activity_name: 'a',
          room_name: 'r',
          supervisor_names: ['s'],
        },
      },
    });
    mockClearLastSession.mockResolvedValueOnce(undefined);

    await useUserStore.getState().clearSessionSettings();

    const settings = useUserStore.getState().sessionSettings;
    expect(settings!.last_session).toBeNull();
    expect(settings!.use_last_session).toBe(false);
    expect(mockClearLastSession).toHaveBeenCalled();
  });

  it('handles null sessionSettings', async () => {
    mockClearLastSession.mockResolvedValueOnce(undefined);

    await useUserStore.getState().clearSessionSettings();

    expect(useUserStore.getState().sessionSettings).toBeNull();
  });

  it('handles error gracefully', async () => {
    mockClearLastSession.mockRejectedValueOnce(new Error('Clear failed'));

    await useUserStore.getState().clearSessionSettings();

    // Should not throw
  });
});

// ====================================================================
// submitDailyFeedback
// ====================================================================

describe('submitDailyFeedback', () => {
  it('submits feedback when authenticated', async () => {
    setAuthenticated();
    mockSubmitDailyFeedback.mockResolvedValueOnce(undefined);

    const result = await useUserStore.getState().submitDailyFeedback(10, 'happy');

    expect(result).toBe(true);
    expect(mockSubmitDailyFeedback).toHaveBeenCalledWith('1234', {
      student_id: 10,
      value: 'happy',
    });
  });

  it('returns false when not authenticated', async () => {
    const result = await useUserStore.getState().submitDailyFeedback(10, 'happy');

    expect(result).toBe(false);
    expect(mockSubmitDailyFeedback).not.toHaveBeenCalled();
  });

  it('returns false on API error', async () => {
    setAuthenticated();
    mockSubmitDailyFeedback.mockRejectedValueOnce(new Error('Server error'));

    const result = await useUserStore.getState().submitDailyFeedback(10, 'happy');

    expect(result).toBe(false);
  });
});

// ====================================================================
// Session state clearing
// ====================================================================

describe('clearSessionState', () => {
  it('clears session-scoped state', () => {
    useUserStore.setState({
      selectedRoom: { id: 1, name: 'Test', is_occupied: false },
      selectedActivity: { id: 1, name: 'Test', category: 'Test' } as ActivityResponse,
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      } as CurrentSession,
    });

    useUserStore.getState().clearSessionState();

    const state = useUserStore.getState();
    expect(state.selectedRoom).toBeNull();
    expect(state.selectedActivity).toBeNull();
    expect(state.currentSession).toBeNull();
  });

  it('clears RFID session state but preserves tagToStudentMap', () => {
    useUserStore.getState().mapTagToStudent('04:AA:BB', 'student-1');
    useUserStore.getState().addToProcessingQueue('04:CC:DD');
    useUserStore.getState().recordTagScan('04:EE:FF', { timestamp: Date.now() });
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');

    useUserStore.getState().clearSessionState();

    const rfid = useUserStore.getState().rfid;
    // Should preserve
    expect(rfid.tagToStudentMap.has('04:AA:BB')).toBe(true);
    // Should clear
    expect(rfid.processingQueue.size).toBe(0);
    expect(rfid.recentTagScans.size).toBe(0);
    expect(rfid.studentHistory.size).toBe(0);
    expect(rfid.optimisticScans).toHaveLength(0);
  });

  it('clears activeSupervisorTags', () => {
    useUserStore.getState().addActiveSupervisorTag('04:AA:BB');

    useUserStore.getState().clearSessionState();

    expect(useUserStore.getState().activeSupervisorTags.size).toBe(0);
  });
});
