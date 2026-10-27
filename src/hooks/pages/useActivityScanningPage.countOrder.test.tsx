import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NfcScanEvent } from '../../platform/adapter';
import { api, type CurrentSession, type RfidScanResponse } from '../../services/api';
import { useUserStore } from '../../store/userStore';

import { useActivityScanningPage } from './useActivityScanningPage';

// The real scan hook runs; only the platform adapter and the HTTP API are faked.
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
      updateSessionActivity: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const { adapter } = await import('@platform');
const mockedApi = vi.mocked(api);

const session = (overrides: Partial<CurrentSession> = {}): CurrentSession => ({
  active_group_id: 100,
  activity_id: 1,
  activity_name: 'Nachmittagsbetreuung',
  room_id: 1,
  room_name: 'Raum 101',
  device_id: 1,
  start_time: '2026-10-27T08:00:00Z',
  duration: '1h',
  is_active: true,
  ...overrides,
});

const checkIn = (activeStudents: number): RfidScanResponse => ({
  student_id: activeStudents,
  student_name: 'Kind',
  action: 'checked_in',
  room_name: 'Raum 101',
  active_students: activeStudents,
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

let onScan: (event: NfcScanEvent) => void = () => undefined;
let scanId = 0;

async function renderPage() {
  const view = renderHook(() => useActivityScanningPage(), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

/** Starts a scan whose server answer is held back until `answer` is called. */
async function startScan(tagId: string) {
  const reply = deferred<RfidScanResponse>();
  mockedApi.processRfidScan.mockReturnValueOnce(reply.promise);
  await act(async () => {
    onScan({ tagId, scanId: ++scanId });
    await vi.advanceTimersByTimeAsync(0);
  });
  return async (activeStudents?: number) => {
    await act(async () => {
      reply.resolve({ ...checkIn(activeStudents ?? 0), active_students: activeStudents });
      await vi.advanceTimersByTimeAsync(0);
    });
  };
}

/** Holds back the answer of the next session poll. */
function holdNextPoll() {
  const reply = deferred<CurrentSession>();
  mockedApi.getCurrentSession.mockReturnValueOnce(reply.promise);
  return async (activeStudents: number) => {
    await act(async () => {
      reply.resolve(session({ active_students: activeStudents }));
      await vi.advanceTimersByTimeAsync(0);
    });
  };
}

async function nextPollTick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
}

describe('useActivityScanningPage student count order', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(adapter.startScanning).mockImplementation(async callback => {
      onScan = callback;
    });
    mockedApi.getCurrentSession.mockResolvedValue(session({ active_students: 10 }));
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
      selectedRoom: { id: 1, name: 'Raum 101', is_occupied: true },
      currentSession: session({ active_students: 10 }),
      selectedSupervisors: [{ id: 7, name: 'Betreuung' }],
    });
  });

  afterEach(async () => {
    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps the count of a later scan when an earlier scan answers late', async () => {
    const { result } = await renderPage();

    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');
    const answerScanB = await startScan('04:BB:BB:BB:BB:BB:02');
    await answerScanB(14);
    expect(result.current.studentCount).toBe(14);

    await answerScanA(13);
    expect(result.current.studentCount).toBe(14);
  });

  it('applies a legacy delta only onto a count older than its scan, and only once', async () => {
    const { result } = await renderPage();

    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');
    const answerScanB = await startScan('04:BB:BB:BB:BB:BB:02');
    await answerScanB();
    expect(result.current.studentCount).toBe(11);

    // A started before the value B produced; the next poll counts A in.
    await answerScanA();
    expect(result.current.studentCount).toBe(11);

    const scanResult = useUserStore.getState().rfid.currentScan;
    await act(async () => useUserStore.getState().hideScanModal());
    await act(async () => {
      useUserStore.getState().setScanResult(scanResult);
      useUserStore.getState().showScanModal();
    });
    expect(result.current.studentCount).toBe(11);
  });

  it('does not add a legacy delta onto a newer poll that already counts the booking', async () => {
    const { result } = await renderPage();

    const answerScan = await startScan('04:AA:AA:AA:AA:AA:01');
    mockedApi.getCurrentSession.mockResolvedValueOnce(session({ active_students: 11 }));
    await nextPollTick();
    expect(result.current.studentCount).toBe(11);

    await answerScan();
    expect(result.current.studentCount).toBe(11);
  });

  it('discards a scan answer that started before the page was opened again', async () => {
    const firstVisit = await renderPage();
    const answerScan = await startScan('04:AA:AA:AA:AA:AA:01');
    firstVisit.unmount();

    useUserStore.setState({
      selectedActivity: { ...useUserStore.getState().selectedActivity!, id: 3, name: 'Lese-AG' },
      currentSession: session({ active_group_id: 300, activity_id: 3, active_students: 3 }),
    });
    holdNextPoll();
    const { result } = await renderPage();
    expect(result.current.studentCount).toBe(3);

    await answerScan(13);
    expect(result.current.studentCount).toBe(3);
  });

  it('discards a legacy delta from the previous count scope', async () => {
    const { result } = await renderPage();
    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');
    holdNextPoll();
    await act(async () => {
      useUserStore.setState({
        selectedActivity: { ...useUserStore.getState().selectedActivity!, id: 2 },
        currentSession: session({ active_group_id: 200, activity_id: 2, active_students: 3 }),
      });
    });
    expect(result.current.studentCount).toBe(3);

    await answerScanA();
    expect(result.current.studentCount).toBe(3);
  });

  it('keeps the count of a newer poll when an earlier scan answers late', async () => {
    const { result } = await renderPage();

    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');
    mockedApi.getCurrentSession.mockResolvedValueOnce(session({ active_students: 14 }));
    await nextPollTick();
    expect(result.current.studentCount).toBe(14);

    await answerScanA(13);
    expect(result.current.studentCount).toBe(14);
  });

  it('keeps a scan count when an earlier poll answers late', async () => {
    const answerFirstPoll = holdNextPoll();
    const { result } = await renderPage();

    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');
    await answerScanA(13);
    expect(result.current.studentCount).toBe(13);

    await answerFirstPoll(12);
    expect(result.current.studentCount).toBe(13);
  });

  it('discards answers that were pending when the activity changed', async () => {
    const answerFirstPoll = holdNextPoll();
    const { result } = await renderPage();
    const answerScanA = await startScan('04:AA:AA:AA:AA:AA:01');

    const answerPollAfterChange = holdNextPoll();
    await act(async () => {
      useUserStore.setState({
        selectedActivity: {
          ...useUserStore.getState().selectedActivity!,
          id: 2,
          name: 'Bastel-AG',
        },
        currentSession: session({ active_group_id: 200, activity_id: 2, active_students: 3 }),
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.studentCount).toBe(3);

    await answerScanA(13);
    await answerFirstPoll(12);
    expect(result.current.studentCount).toBe(3);

    await answerPollAfterChange(4);
    expect(result.current.studentCount).toBe(4);
  });
});
