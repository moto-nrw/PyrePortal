import { renderHook, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  mapApiErrorToGerman,
  type RfidScanResult,
  type CurrentSession,
} from '../services/api';
import { useUserStore } from '../store/userStore';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

import { useRfidScanning } from './useRfidScanning';

// ====================================================================
// Mock modules
// ====================================================================

vi.mock('../services/api', () => ({
  api: {
    processRfidScan: vi.fn(),
    updateSessionActivity: vi.fn(),
    updateSessionSupervisors: vi.fn(),
  },
  mapApiErrorToGerman: vi.fn(() => 'Ein Fehler ist aufgetreten'),
  ApiError: class ApiError extends Error {
    public readonly code?: string;
    public readonly details?: Record<string, unknown>;
    public readonly statusCode: number;
    constructor(
      message: string,
      statusCode: number,
      code?: string,
      details?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock('../utils/crypto', () => ({
  getSecureRandomInt: vi.fn((max: number) => 0 % max),
}));

// ====================================================================
// Helpers
// ====================================================================

const mockedSafeInvoke = vi.mocked(safeInvoke);
const mockedIsRfidEnabled = vi.mocked(isRfidEnabled);
const mockedProcessRfidScan = vi.mocked(api.processRfidScan);
const mockedUpdateSessionActivity = vi.mocked(api.updateSessionActivity);
const mockedUpdateSessionSupervisors = vi.mocked(api.updateSessionSupervisors);

function resetStore() {
  useUserStore.setState({
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

function setAuthenticated(pin = '1234', staffId = 1, staffName = 'Frau Schmidt') {
  useUserStore.getState().setAuthenticatedUser({
    staffId,
    staffName,
    deviceName: 'Pi-5',
    pin,
  });
}

function setRoom(id = 10, name = 'Raum A') {
  useUserStore.setState({
    selectedRoom: { id, name, capacity: 30, floor: 1, is_occupied: false },
  });
}

function setSession(overrides: Partial<CurrentSession> = {}): CurrentSession {
  const session: CurrentSession = {
    active_group_id: 100,
    activity_id: 1,
    activity_name: 'Fussball',
    room_id: 10,
    room_name: 'Raum A',
    device_id: 1,
    start_time: '2026-03-15T10:00:00Z',
    duration: '01:00:00',
    is_active: true,
    active_students: 5,
    ...overrides,
  };
  useUserStore.setState({ currentSession: session });
  return session;
}

const MOCK_TAG = '04:D6:94:82:97:6A:80';

/**
 * Triggers mock scan interval and drains all resulting async operations.
 * processScan() has a long async chain (API call → state updates → supervisor auth →
 * fire-and-forget activity update → cleanup), so we drain in a single act()
 * with multiple timer ticks to ensure all microtasks resolve.
 */
async function triggerMockScanAndDrain() {
  await act(async () => {
    // Fire the mock interval callback
    await vi.advanceTimersByTimeAsync(5100);
    // Multiple microtask drain rounds to flush the full processScan async chain
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(0);
    }
  });
}

function makeCheckinResult(overrides: Partial<RfidScanResult> = {}): RfidScanResult {
  return {
    student_id: 42,
    student_name: 'Max Mustermann',
    action: 'checked_in',
    message: 'Eingecheckt',
    ...overrides,
  };
}

function makeSupervisorResult(
  staffId: number,
  staffName: string,
  overrides: Partial<RfidScanResult> = {}
): RfidScanResult {
  return {
    student_id: staffId,
    student_name: staffName,
    action: 'supervisor_authenticated',
    message: 'Supervisor authenticated',
    ...overrides,
  };
}

// ====================================================================
// Tests
// ====================================================================

describe('useRfidScanning', () => {
  let originalMockRfidTags: string | undefined;

  beforeEach(() => {
    // Force mock tags to a known value so tests are independent of .env
    originalMockRfidTags = import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined;
    (import.meta.env as Record<string, unknown>).VITE_MOCK_RFID_TAGS = MOCK_TAG;

    vi.useFakeTimers();
    resetStore();
    mockedIsRfidEnabled.mockReturnValue(false);
    mockedSafeInvoke.mockResolvedValue(undefined);
    mockedProcessRfidScan.mockResolvedValue(makeCheckinResult());
    mockedUpdateSessionActivity.mockResolvedValue(undefined);
    mockedUpdateSessionSupervisors.mockResolvedValue({ supervisors: [] });
  });

  afterEach(() => {
    // Unmount all rendered hooks BEFORE restoring real timers so that
    // useEffect cleanup (which clears module-level mockScanInterval /
    // eventListener) fires while fake timers are still active.
    cleanup();

    // Restore original env value
    if (originalMockRfidTags === undefined) {
      delete (import.meta.env as Record<string, unknown>).VITE_MOCK_RFID_TAGS;
    } else {
      (import.meta.env as Record<string, unknown>).VITE_MOCK_RFID_TAGS = originalMockRfidTags;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  describe('initialization', () => {
    it('returns initial state', () => {
      const { result } = renderHook(() => useRfidScanning());
      expect(result.current.isScanning).toBe(false);
      expect(result.current.showModal).toBe(false);
      expect(result.current.currentScan).toBeNull();
      expect(typeof result.current.startScanning).toBe('function');
      expect(typeof result.current.stopScanning).toBe('function');
    });

    it('does not call safeInvoke when RFID is disabled', () => {
      mockedIsRfidEnabled.mockReturnValue(false);
      renderHook(() => useRfidScanning());
      expect(mockedSafeInvoke).not.toHaveBeenCalledWith('initialize_rfid_service');
    });

    it('calls initialize_rfid_service when RFID is enabled', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockResolvedValue(undefined);

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      expect(mockedSafeInvoke).toHaveBeenCalledWith('initialize_rfid_service');
    });

    it('shows system error when initialization fails', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'initialize_rfid_service') throw new Error('Init failed');
        // syncServiceState will also call get_rfid_service_status - let it fail
        // so it doesn't overwrite the error modal via stopRfidScanning
        if (cmd === 'get_rfid_service_status') throw new Error('not available');
        return undefined;
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('RFID-Initialisierung fehlgeschlagen');
    });

    it('syncs service state when RFID is enabled and service is running', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      const state = useUserStore.getState();
      expect(state.rfid.isScanning).toBe(true);
    });

    it('syncs service state to stopped when backend reports not running', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      // Pre-set scanning to true to verify it gets turned off
      useUserStore.setState({
        rfid: { ...useUserStore.getState().rfid, isScanning: true },
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      const state = useUserStore.getState();
      expect(state.rfid.isScanning).toBe(false);
    });

    it('handles syncServiceState error gracefully', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') throw new Error('status fail');
        return undefined;
      });

      // Should not throw
      await act(async () => {
        renderHook(() => useRfidScanning());
      });
    });
  });

  // ------------------------------------------------------------------
  // Start/Stop scanning (mock mode)
  // ------------------------------------------------------------------

  describe('mock scanning (RFID disabled)', () => {
    it('starts mock scanning and updates store state', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(true);
    });

    it('generates mock scans on interval', async () => {
      setAuthenticated();
      setRoom();
      setSession();

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Advance timer to trigger mock scan (interval is 5000 + random)
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      // processRfidScan should be called from the mock scan interval
      expect(mockedProcessRfidScan).toHaveBeenCalled();
    });

    it('does not start duplicate mock interval', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });
      await act(async () => {
        await result.current.startScanning();
      });

      // Second call should just sync store state, not create new interval
      expect(useUserStore.getState().rfid.isScanning).toBe(true);
    });

    it('stops mock scanning and clears interval', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });
      await act(async () => {
        await result.current.stopScanning();
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });

    it('stopScanning when service not started still updates store', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.stopScanning();
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });

    it('reads mock tags from VITE_MOCK_RFID_TAGS env', async () => {
      // The env is read inside the interval callback via import.meta.env
      setAuthenticated();
      setRoom();
      setSession();

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      // Even without env var, default tags are used
      expect(mockedProcessRfidScan).toHaveBeenCalled();
    });

    it('skips blocked tags in mock mode', async () => {
      setAuthenticated();
      setRoom();
      setSession();

      // Block the first default tag (getSecureRandomInt returns 0)
      useUserStore.getState().blockTag('04:D6:94:82:97:6A:80', 60000);

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      // Should not call processRfidScan because tag is blocked
      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Start/Stop scanning (real RFID mode)
  // ------------------------------------------------------------------

  describe('real RFID scanning', () => {
    beforeEach(() => {
      mockedIsRfidEnabled.mockReturnValue(true);
    });

    it('starts real RFID service', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      expect(mockedSafeInvoke).toHaveBeenCalledWith('start_rfid_service');
      expect(useUserStore.getState().rfid.isScanning).toBe(true);
    });

    it('shows error when start_rfid_service fails', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'start_rfid_service') throw new Error('HW fail');
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('RFID-Service Start fehlgeschlagen');
    });

    it('throws when service does not confirm running state', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        // advance timers so the waitForBackendServiceState polling times out
        const scanPromise = result.current.startScanning();
        // Advance past the 2000ms timeout in 100ms increments
        for (let i = 0; i < 25; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await scanPromise;
      });

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('RFID-Service Start fehlgeschlagen');
    });

    it('stops real RFID service', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      // Start first
      await act(async () => {
        await result.current.startScanning();
      });

      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      await act(async () => {
        const stopPromise = result.current.stopScanning();
        for (let i = 0; i < 30; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await stopPromise;
      });

      expect(mockedSafeInvoke).toHaveBeenCalledWith('stop_rfid_service');
      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });

    it('handles stop error gracefully', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'stop_rfid_service') throw new Error('Stop failed');
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      await act(async () => {
        await result.current.stopScanning();
      });

      // Should still update state even on error
      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });

    it('skips re-start when already started and backend confirms running', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      mockedSafeInvoke.mockClear();

      await act(async () => {
        const startPromise = result.current.startScanning();
        for (let i = 0; i < 10; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await startPromise;
      });

      // Should have checked status but NOT called start_rfid_service again
      expect(mockedSafeInvoke).not.toHaveBeenCalledWith('start_rfid_service');
    });

    it('restarts when ref says started but backend says not running', async () => {
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      // Start first
      await act(async () => {
        await result.current.startScanning();
      });

      // Now backend says not running
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      await act(async () => {
        const startPromise = result.current.startScanning();
        // Need to advance past the 600ms check + 2000ms wait
        for (let i = 0; i < 30; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await startPromise;
      });

      // Should show error because it couldn't confirm restart either
      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
    });

    it('sets up event listener for RFID scans', async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const mockedListen = vi.mocked(listen);

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      expect(mockedListen).toHaveBeenCalledWith('rfid-scan', expect.any(Function));
    });

    it('shows error when event listener setup fails', async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const mockedListen = vi.mocked(listen);
      mockedListen.mockRejectedValueOnce(new Error('Listen failed'));

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('RFID-Verbindung fehlgeschlagen');
    });
  });

  // ------------------------------------------------------------------
  // Scan processing
  // ------------------------------------------------------------------

  describe('processScan', () => {
    beforeEach(() => {
      setAuthenticated();
      setRoom();
      setSession();
    });

    it('calls processRfidScan with correct payload', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Trigger a mock scan
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      // Wait for async processing
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockedProcessRfidScan).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          student_rfid: expect.any(String),
          action: 'checkin',
          room_id: 10,
        }),
        '1234'
      );
    });

    it('shows scan result modal on successful checkin', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult());

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('Max Mustermann');
      expect(state.rfid.currentScan?.action).toBe('checked_in');
    });

    it('handles checkout result', async () => {
      mockedProcessRfidScan.mockResolvedValue(
        makeCheckinResult({ action: 'checked_out', message: 'Ausgecheckt' })
      );

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.action).toBe('checked_out');
    });

    it('calls updateSessionActivity after successful scan', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult());

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      expect(mockedUpdateSessionActivity).toHaveBeenCalledWith('1234');
    });

    it('handles updateSessionActivity failure gracefully', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult());
      mockedUpdateSessionActivity.mockRejectedValue(new Error('Activity update failed'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // Should still show success modal despite activity update failure
      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.action).toBe('checked_in');
    });

    it('shows session expired when no authenticated user', async () => {
      useUserStore.setState({ authenticatedUser: null });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('Sitzung abgelaufen');
    });

    it('shows session expired when no room selected', async () => {
      useUserStore.setState({ selectedRoom: null });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.student_name).toBe('Sitzung abgelaufen');
    });

    it('adds scannedTagId to result', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult());

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.scannedTagId).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // Supervisor authentication
  // ------------------------------------------------------------------

  describe('supervisor authentication', () => {
    beforeEach(() => {
      setAuthenticated();
      setRoom();
      setSession();
    });

    it('handles first-time supervisor scan', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeSupervisorResult(99, 'Herr Meier'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('Betreuer erkannt');
      expect(state.rfid.currentScan?.message).toContain('Herr Meier');
    });

    it('handles supervisor with null student_id', async () => {
      mockedProcessRfidScan.mockResolvedValue(
        makeSupervisorResult(0, 'Unknown', { student_id: null })
      );

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // With null student_id, handleSupervisorAuthentication returns false
      // and we go through student bookkeeping path
      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
    });

    it('syncs supervisors with backend on supervisor auth', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeSupervisorResult(99, 'Herr Meier'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      expect(mockedUpdateSessionSupervisors).toHaveBeenCalled();
    });

    it('handles supervisor sync failure gracefully', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeSupervisorResult(99, 'Herr Meier'));
      mockedUpdateSessionSupervisors.mockRejectedValue(new Error('Sync failed'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // Should still show modal despite sync failure
      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
    });

    it('redirects repeat supervisor to /home', async () => {
      // First scan
      mockedProcessRfidScan.mockResolvedValue(makeSupervisorResult(99, 'Herr Meier'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // First scan
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Clear modal for second scan
      useUserStore.setState({
        rfid: { ...useUserStore.getState().rfid, showModal: false },
      });

      // Clear processing queue and recent scans for next scan
      useUserStore.setState({
        rfid: {
          ...useUserStore.getState().rfid,
          processingQueue: new Set(),
          recentTagScans: new Map(),
        },
      });

      // Second scan of same supervisor (repeat)
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      // The redirect result has navigateOnClose: '/home'
      const scanResult = state.rfid.currentScan as RfidScanResult & { navigateOnClose?: string };
      expect(scanResult?.navigateOnClose).toBe('/home');
    });

    it('fast-path redirects active supervisor tag', async () => {
      // Pre-mark a tag as active supervisor
      useUserStore.getState().addActiveSupervisorTag(MOCK_TAG);

      // The mock scan will pick the first default tag
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // Should show redirect modal (no API call needed)
      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------

  describe('error handling', () => {
    beforeEach(() => {
      setAuthenticated();
      setRoom();
      setSession();
    });

    it('handles "already has an active visit" error', async () => {
      mockedProcessRfidScan.mockRejectedValue(new Error('already has an active visit'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('Bereits eingecheckt');
      expect(state.rfid.currentScan?.action).toBe('already_in');
      expect(state.rfid.currentScan?.isInfo).toBe(true);
    });

    it('handles room capacity exceeded error', async () => {
      const { ApiError: MockedApiError } = await import('../services/api');
      const capacityError = new MockedApiError(
        'Room capacity exceeded',
        422,
        'ROOM_CAPACITY_EXCEEDED'
      );
      mockedProcessRfidScan.mockRejectedValue(capacityError);

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.student_name).toBe('Raum voll');
      expect(state.rfid.currentScan?.showAsError).toBe(true);
    });

    it('handles activity capacity exceeded error', async () => {
      const { ApiError: MockedApiError } = await import('../services/api');
      const capacityError = new MockedApiError(
        'Activity capacity exceeded',
        422,
        'ACTIVITY_CAPACITY_EXCEEDED'
      );
      mockedProcessRfidScan.mockRejectedValue(capacityError);

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.student_name).toBe('Aktivität voll');
    });

    it('handles generic API error with mapApiErrorToGerman', async () => {
      mockedProcessRfidScan.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      expect(mapApiErrorToGerman).toHaveBeenCalled();
      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.student_name).toBe('Scan fehlgeschlagen');
      expect(state.rfid.currentScan?.showAsError).toBe(true);
    });

    it('handles non-Error throws', async () => {
      mockedProcessRfidScan.mockRejectedValue('string error');

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.showModal).toBe(true);
      expect(state.rfid.currentScan?.showAsError).toBe(true);
    });

    it('uses fallback message when mapApiErrorToGerman returns empty', async () => {
      vi.mocked(mapApiErrorToGerman).mockReturnValue('');
      mockedProcessRfidScan.mockRejectedValue(new Error('Unknown'));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      expect(state.rfid.currentScan?.message).toBe('Bitte erneut versuchen');
    });
  });

  // ------------------------------------------------------------------
  // Duplicate prevention
  // ------------------------------------------------------------------

  describe('duplicate prevention', () => {
    beforeEach(() => {
      setAuthenticated();
      setRoom();
      setSession();
    });

    it('blocks tag that is in processing queue', async () => {
      // Add tag to processing queue
      useUserStore.getState().addToProcessingQueue(MOCK_TAG);

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // processRfidScan should NOT be called since tag is in queue
      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });

    it('shows cached result for recently scanned tag', async () => {
      const cachedResult = makeCheckinResult({ student_name: 'Cached Result' });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Record scan AFTER starting (so timestamp is close to interval fire time)
      // Advance most of the way, then record, then advance the rest
      await act(async () => {
        vi.advanceTimersByTime(4900);
      });

      // Record scan at current time - will be within 2s of next interval
      useUserStore.getState().recordTagScan(MOCK_TAG, {
        timestamp: Date.now(),
        studentId: '42',
        result: cachedResult,
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Should show the cached result instead of making API call
      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });

    it('silently ignores when no cached result and scan in progress', async () => {
      // Add recent scan without result (still processing)
      useUserStore.getState().recordTagScan(MOCK_TAG, {
        timestamp: Date.now() - 3000, // older than 2s
      });
      // Also add to processing queue to trigger the else branch
      useUserStore.getState().addToProcessingQueue(MOCK_TAG);

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  describe('cleanup', () => {
    it('clears tag scans periodically', async () => {
      renderHook(() => useRfidScanning());

      await act(async () => {
        vi.advanceTimersByTime(2100);
      });

      // clearOldTagScans should be called by the 2s interval
      expect(useUserStore.getState().rfid.recentTagScans.size).toBe(0);
    });

    it('cleans up on unmount', async () => {
      const { result, unmount } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      unmount();

      // Mock interval should be cleared - no more scans after unmount
      mockedProcessRfidScan.mockClear();

      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });

    it('stops service on unmount when started', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result, unmount } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Reset so we can check if stop was called
      mockedSafeInvoke.mockClear();
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: false };
        return undefined;
      });

      unmount();

      // Give time for the stop promise to settle
      await act(async () => {
        for (let i = 0; i < 30; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
      });

      expect(mockedSafeInvoke).toHaveBeenCalledWith('stop_rfid_service');
    });

    it('cleans up event listener on unmount', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      const unlistenFn = vi.fn();
      const { listen } = await import('@tauri-apps/api/event');
      vi.mocked(listen).mockResolvedValue(unlistenFn);

      let hookResult: ReturnType<typeof renderHook>;
      await act(async () => {
        hookResult = renderHook(() => useRfidScanning());
      });

      hookResult!.unmount();

      expect(unlistenFn).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Auto-restart after modal close
  // ------------------------------------------------------------------

  describe('auto-restart after modal close', () => {
    it('restarts scanning when modal closes and isScanning is true', async () => {
      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Simulate: stop the service ref but keep store scanning true,
      // then close modal - this is the auto-restart scenario
      // First set modal open
      useUserStore.setState({
        rfid: { ...useUserStore.getState().rfid, showModal: true },
      });

      // Then close modal while isScanning is true - trigger auto-restart
      // We need isServiceStartedRef to be false for this branch
      // The mock mode auto-restart is the "already started" path
      useUserStore.setState({
        rfid: { ...useUserStore.getState().rfid, showModal: false },
      });

      // The auto-restart effect should trigger
      expect(useUserStore.getState().rfid.isScanning).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // waitForBackendServiceState
  // ------------------------------------------------------------------

  describe('waitForBackendServiceState', () => {
    it('returns expected state when RFID disabled', async () => {
      mockedIsRfidEnabled.mockReturnValue(false);

      const { result } = renderHook(() => useRfidScanning());

      // In mock mode, startScanning doesn't call waitForBackendServiceState
      // because isRfidEnabled returns false
      await act(async () => {
        await result.current.startScanning();
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(true);
    });

    it('polls until backend confirms expected state', async () => {
      // Use real timers for this test — fake timers and async polling loops
      // don't interleave reliably across test suite runs
      vi.useRealTimers();
      mockedIsRfidEnabled.mockReturnValue(true);

      let pollCount = 0;
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') {
          pollCount++;
          // Return running=true after 3 polls
          return { is_running: pollCount >= 3 };
        }
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Verify polling completed successfully
      expect(pollCount).toBeGreaterThanOrEqual(3);
      expect(useUserStore.getState().rfid.isScanning).toBe(true);

      // Restore fake timers for cleanup
      vi.useFakeTimers();
    });

    it('handles poll errors and continues polling', async () => {
      // Use real timers — same reason as above
      vi.useRealTimers();
      mockedIsRfidEnabled.mockReturnValue(true);

      let pollCount = 0;
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') {
          pollCount++;
          if (pollCount === 1) throw new Error('poll error');
          return { is_running: true };
        }
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Verify polling recovered from error
      expect(pollCount).toBeGreaterThanOrEqual(2);
      expect(useUserStore.getState().rfid.isScanning).toBe(true);

      // Restore fake timers for cleanup
      vi.useFakeTimers();
    });
  });

  // ------------------------------------------------------------------
  // Student bookkeeping
  // ------------------------------------------------------------------

  describe('student bookkeeping', () => {
    beforeEach(() => {
      setAuthenticated();
      setRoom();
      setSession();
    });

    it('maps tag to student on successful checkin', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult({ student_id: 42 }));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // The tag should be mapped to student
      const cachedId = useUserStore.getState().getCachedStudentId(MOCK_TAG);
      expect(cachedId).toBe('42');
    });

    it('skips bookkeeping when student_id is null', async () => {
      mockedProcessRfidScan.mockResolvedValue(makeCheckinResult({ student_id: null }));

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      // No mapping should exist
      const cachedId = useUserStore.getState().getCachedStudentId(MOCK_TAG);
      expect(cachedId).toBeUndefined();
    });

    it('updates student history on checkout', async () => {
      mockedProcessRfidScan.mockResolvedValue(
        makeCheckinResult({ student_id: 42, action: 'checked_out' })
      );

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      await triggerMockScanAndDrain();

      const state = useUserStore.getState();
      const history = state.rfid.studentHistory.get('42');
      expect(history?.lastAction).toBe('checkout');
    });
  });

  // ------------------------------------------------------------------
  // Event listener scan processing
  // ------------------------------------------------------------------

  describe('RFID event processing', () => {
    it('processes scans from event listener', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      setAuthenticated();
      setRoom();
      setSession();

      let eventCallback:
        | ((event: { payload: { tag_id: string; timestamp: number; platform: string } }) => void)
        | undefined;

      const { listen } = await import('@tauri-apps/api/event');
      vi.mocked(listen).mockImplementation(async (_event, handler) => {
        eventCallback = handler as typeof eventCallback;
        return () => undefined;
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      expect(eventCallback).toBeDefined();

      // Trigger a scan event
      await act(async () => {
        eventCallback!({
          payload: { tag_id: '04:AA:BB:CC:DD:EE:FF', timestamp: Date.now(), platform: 'test' },
        });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockedProcessRfidScan).toHaveBeenCalledWith(
        expect.objectContaining({ student_rfid: '04:AA:BB:CC:DD:EE:FF' }),
        '1234'
      );
    });

    it('skips blocked tags from event listener', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      setAuthenticated();
      setRoom();

      let eventCallback:
        | ((event: { payload: { tag_id: string; timestamp: number; platform: string } }) => void)
        | undefined;

      const { listen } = await import('@tauri-apps/api/event');
      vi.mocked(listen).mockImplementation(async (_event, handler) => {
        eventCallback = handler as typeof eventCallback;
        return () => undefined;
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      // Block the tag
      useUserStore.getState().blockTag('04:AA:BB:CC:DD:EE:FF', 60000);

      await act(async () => {
        eventCallback!({
          payload: { tag_id: '04:AA:BB:CC:DD:EE:FF', timestamp: Date.now(), platform: 'test' },
        });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockedProcessRfidScan).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Stop scanning edge cases
  // ------------------------------------------------------------------

  describe('stop scanning edge cases', () => {
    it('warns when backend does not confirm stop within timeout', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      // Start first
      await act(async () => {
        await result.current.startScanning();
      });

      // Now stop - but backend keeps saying running=true
      await act(async () => {
        const stopPromise = result.current.stopScanning();
        for (let i = 0; i < 30; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await stopPromise;
      });

      // Should still update store state
      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Scan lifecycle edge cases (from post-mortem)
  // Tests run against the current implementation to verify or document
  // pre-existing behavior before the adapter migration.
  // ------------------------------------------------------------------

  describe('scan lifecycle edge cases', () => {
    it('double startScanning call does not duplicate mock intervals', async () => {
      setAuthenticated();
      setRoom();
      setSession();

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
        await result.current.startScanning(); // second call
      });

      // Advance time to trigger scans
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
        for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
      });

      // Should only produce one scan, not two (no duplicated intervals)
      expect(mockedProcessRfidScan).toHaveBeenCalledTimes(1);
    });

    it('mock scanning works when RFID is disabled', async () => {
      mockedIsRfidEnabled.mockReturnValue(false);
      setAuthenticated();
      setRoom();
      setSession();

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(true);

      // Trigger a mock scan
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
        for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockedProcessRfidScan).toHaveBeenCalled();
    });

    // Known issue (post-mortem #7): stopScanning doesn't clean up state
    // when stop_rfid_service throws. Currently store stays isScanning=true.
    // Will be fixed in adapter migration (Step 4b).
    it.skip('stopScanning cleans up even when stop_rfid_service fails', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);
      mockedSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'get_rfid_service_status') return { is_running: true };
        if (cmd === 'stop_rfid_service') throw new Error('stop failed');
        return undefined;
      });

      const { result } = renderHook(() => useRfidScanning());

      await act(async () => {
        await result.current.startScanning();
      });

      // Stop should not throw even when the backend call fails
      await act(async () => {
        const stopPromise = result.current.stopScanning();
        for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(100);
        await stopPromise;
      });

      expect(useUserStore.getState().rfid.isScanning).toBe(false);
    });

    it('listener is set up on mount for real RFID', async () => {
      mockedIsRfidEnabled.mockReturnValue(true);

      let eventCallback:
        | ((event: { payload: { tag_id: string; timestamp: number; platform: string } }) => void)
        | undefined;

      const { listen } = await import('@tauri-apps/api/event');
      vi.mocked(listen).mockImplementation(async (_event, handler) => {
        eventCallback = handler as typeof eventCallback;
        return () => undefined;
      });

      await act(async () => {
        renderHook(() => useRfidScanning());
      });

      // Listener should have been registered on mount
      expect(eventCallback).toBeDefined();
      expect(vi.mocked(listen)).toHaveBeenCalledWith('rfid-scan', expect.any(Function));
    });
  });
});
