import { describe, expect, it, beforeEach } from 'vitest';

import { useUserStore } from './userStore';

// ====================================================================
// Helper: reset store between tests
// ====================================================================

function resetStore() {
  // Access store API directly (not via React hook)
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
    selectedSupervisors: [],
    activeSupervisorTags: new Set<string>(),
    isLoading: false,
    error: null,
    nfcScanActive: false,
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

beforeEach(() => {
  resetStore();
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
// Supervisor selection
// ====================================================================

describe('Supervisor selection', () => {
  const user1 = {
    id: 1,
    name: 'Herr Müller',
  };
  const user2 = {
    id: 2,
    name: 'Frau Schmidt',
  };

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
    useUserStore.setState({
      users: [{ id: 10, name: 'Max Müller' }],
    });
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
    useUserStore.getState().recordTagScan('04:AA:BB', {
      timestamp: Date.now(),
    });
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(false);
  });

  it('allows tag after scan expires (Layer 2)', () => {
    useUserStore.getState().recordTagScan('04:AA:BB', {
      timestamp: Date.now() - 3000, // 3 seconds ago (window is 2s)
    });
    expect(useUserStore.getState().canProcessTag('04:AA:BB')).toBe(true);
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

  it('clearTagScan removes scan and mapping', () => {
    useUserStore.getState().recordTagScan('04:AA:BB', {
      timestamp: Date.now(),
    });
    useUserStore.getState().mapTagToStudent('04:AA:BB', 'student-123');

    useUserStore.getState().clearTagScan('04:AA:BB');
    expect(useUserStore.getState().getCachedStudentId('04:AA:BB')).toBeUndefined();
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
    // updateStudentHistory sets isProcessing: false
    useUserStore.getState().updateStudentHistory('student-1', 'checkin');
    expect(useUserStore.getState().isValidStudentScan('student-1', 'checkin')).toBe(true);
  });

  it('blocks opposite action when processing', () => {
    // Manually set isProcessing: true to simulate in-flight request
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
});

// ====================================================================
// clearOldTagScans
// ====================================================================

describe('clearOldTagScans', () => {
  it('removes scans older than 2 seconds', () => {
    useUserStore.getState().recordTagScan('old-tag', {
      timestamp: Date.now() - 5000,
    });
    useUserStore.getState().recordTagScan('new-tag', {
      timestamp: Date.now(),
    });

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
    const activity = {
      id: 1,
      name: 'Fußball AG',
      category: 'Sport',
    };
    useUserStore.getState().setSelectedActivity(activity);
    expect(useUserStore.getState().selectedActivity).toEqual(activity);
  });

  it('initializes activity with room ID', () => {
    useUserStore.getState().initializeActivity(5);
    const current = useUserStore.getState().currentActivity;
    expect(current).not.toBeNull();
    expect(current!.roomId).toBe(5);
  });

  it('cancels activity creation', () => {
    useUserStore.getState().initializeActivity(5);
    useUserStore.getState().cancelActivityCreation();
    expect(useUserStore.getState().currentActivity).toBeNull();
  });
});

// ====================================================================
// Session state clearing
// ====================================================================

describe('clearSessionState', () => {
  it('clears session-scoped state', () => {
    useUserStore.setState({
      selectedRoom: { id: 1, name: 'Test', is_occupied: false },
      selectedActivity: { id: 1, name: 'Test', category: 'Test' },
      currentSession: {
        active_group_id: 1,
        activity_id: 1,
        device_id: 1,
        start_time: 'now',
        duration: '1h',
      },
    });

    useUserStore.getState().clearSessionState();

    const state = useUserStore.getState();
    expect(state.selectedRoom).toBeNull();
    expect(state.selectedActivity).toBeNull();
    expect(state.currentSession).toBeNull();
  });
});
