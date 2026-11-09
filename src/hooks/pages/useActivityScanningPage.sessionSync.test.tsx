import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NfcScanEvent } from '../../platform/adapter';
import { api, ApiError, NetworkError, type CurrentSession } from '../../services/api';
import { useUserStore } from '../../store/userStore';

import { useActivityScanningPage } from './useActivityScanningPage';

// Issue #512 (IO-1): the server is the source of truth for the device's
// session. The real page and scan hooks run against the real store; only the
// platform adapter and the HTTP API are faked.
vi.mock('@platform', () => ({
  adapter: {
    platform: 'gkt',
    initializeNfc: vi.fn().mockResolvedValue(undefined),
    startScanning: vi.fn(),
    stopScanning: vi.fn().mockResolvedValue(undefined),
    getServiceStatus: vi.fn().mockResolvedValue({ is_running: true }),
  },
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual('../../services/api');
  return {
    ...actual,
    api: {
      getCurrentSession: vi.fn(),
      getActivities: vi.fn().mockResolvedValue([]),
      getRooms: vi.fn().mockResolvedValue([]),
      getDeviceConfig: vi.fn().mockResolvedValue({
        presence_mode: 'detailed',
        checkout: {
          raumwechsel_enabled: true,
          schulhof_enabled: true,
          wc_enabled: true,
          daily_checkout_time: null,
        },
        feedback: { enabled: true },
      }),
      processRfidScan: vi.fn(),
    },
  };
});

const { adapter } = await import('@platform');
const mockedApi = vi.mocked(api);

const localSession = (overrides: Partial<CurrentSession> = {}): CurrentSession => ({
  active_group_id: 100,
  activity_id: 1,
  activity_name: 'Nachmittagsbetreuung',
  room_id: 1,
  room_name: 'Raum 101',
  device_id: 1,
  start_time: '2026-11-09T08:00:00Z',
  duration: '1h',
  is_active: true,
  active_students: 10,
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

let onScan: (event: NfcScanEvent) => void = () => undefined;
let scanId = 0;

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function renderPage() {
  renderHook(() => useActivityScanningPage(), { wrapper });
  await settle();
}

async function scan(tagId = '04:AA:BB:CC:DD:EE:01') {
  await act(async () => {
    onScan({ tagId, scanId: ++scanId });
    await vi.advanceTimersByTimeAsync(0);
  });
  await settle();
}

const refused = (status: number, code: string) =>
  new ApiError(`API Error: ${status}`, status, code);

describe('useActivityScanningPage session sync with the server (#512)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(adapter.startScanning).mockImplementation(async callback => {
      onScan = callback;
    });
    // The server reports the local session until a test says otherwise.
    mockedApi.getCurrentSession.mockResolvedValue(localSession());
    useUserStore.setState({
      ...useUserStore.getInitialState(),
      authenticatedUser: { staffId: 0, staffName: 'OGS Device', deviceName: 'Kiosk', pin: '1234' },
      selectedActivity: {
        id: 1,
        name: 'Nachmittagsbetreuung',
        category: 'OGS',
        category_name: 'OGS',
        room_name: 'Raum 101',
        is_active: true,
        is_occupied: false,
        max_participants: 30,
        enrollment_count: 0,
      },
      selectedRoom: { id: 1, name: 'Raum 101', is_occupied: true, color: '#4A90D9' },
      currentSession: localSession(),
      selectedSupervisors: [{ id: 7, name: 'Betreuung' }],
    });
  });

  afterEach(async () => {
    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('leaves the session when a poll finds that the server ended it', async () => {
    await renderPage();
    expect(useUserStore.getState().currentSession?.active_group_id).toBe(100);

    // Force start on another device or day end: no session for this device.
    mockedApi.getCurrentSession.mockResolvedValue(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await settle();

    const state = useUserStore.getState();
    expect(state.currentSession).toBeNull();
    expect(state.selectedActivity).toBeNull();
    expect(state.selectedRoom).toBeNull();
    expect(state.kioskNotice?.title).toBe('Aufsicht beendet');
    expect(state.authenticatedUser).not.toBeNull();
  });

  it.each([
    ['iot.no_active_groups_in_room', 404],
    ['iot.no_active_session', 404],
  ])(
    'leaves the session after a scan refused with %s, without repeating the scan',
    async (code, status) => {
      await renderPage();
      const pollsBefore = mockedApi.getCurrentSession.mock.calls.length;
      mockedApi.getCurrentSession.mockResolvedValue(null);
      mockedApi.processRfidScan.mockRejectedValueOnce(refused(status, code));

      await scan();

      expect(mockedApi.getCurrentSession.mock.calls.length).toBeGreaterThan(pollsBefore);
      expect(mockedApi.processRfidScan).toHaveBeenCalledTimes(1);
      expect(useUserStore.getState().currentSession).toBeNull();
      expect(useUserStore.getState().kioskNotice?.title).toBe('Aufsicht beendet');
    }
  );

  it('keeps the session when the server still reports it after a session refusal', async () => {
    await renderPage();
    mockedApi.processRfidScan.mockRejectedValueOnce(refused(404, 'iot.no_active_groups_in_room'));

    await scan();

    expect(mockedApi.processRfidScan).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().currentSession?.active_group_id).toBe(100);
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it('takes over the session the server reports instead of the local one', async () => {
    await renderPage();
    mockedApi.getCurrentSession.mockResolvedValue(localSession({ active_group_id: 101 }));
    mockedApi.processRfidScan.mockRejectedValueOnce(refused(404, 'iot.no_active_groups_in_room'));

    await scan();

    expect(useUserStore.getState().currentSession?.active_group_id).toBe(101);
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it('keeps the session when the server cannot be asked', async () => {
    await renderPage();
    mockedApi.getCurrentSession.mockRejectedValue(new NetworkError('Keine Netzwerkverbindung.'));
    mockedApi.processRfidScan.mockRejectedValueOnce(refused(404, 'iot.no_active_session'));

    await scan();

    expect(useUserStore.getState().currentSession?.active_group_id).toBe(100);
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it('does not ask for the session after other scan refusals', async () => {
    await renderPage();
    const pollsBefore = mockedApi.getCurrentSession.mock.calls.length;
    mockedApi.processRfidScan.mockRejectedValueOnce(refused(409, 'iot.room_capacity_exceeded'));

    await scan();

    expect(mockedApi.getCurrentSession.mock.calls.length).toBe(pollsBefore);
    expect(useUserStore.getState().currentSession?.active_group_id).toBe(100);
  });
});
