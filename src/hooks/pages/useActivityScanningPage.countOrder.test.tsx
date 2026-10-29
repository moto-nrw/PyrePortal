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
  return async (activeStudents?: number, fields: Partial<RfidScanResponse> = {}) => {
    await act(async () => {
      reply.resolve({
        ...checkIn(activeStudents ?? 0),
        active_students: activeStudents,
        ...fields,
      });
      await vi.advanceTimersByTimeAsync(0);
    });
  };
}

/** Holds back the answer of the next session poll. */
function holdNextPoll() {
  const reply = deferred<CurrentSession>();
  mockedApi.getCurrentSession.mockReturnValueOnce(reply.promise);
  return async (activeStudents: number, fields: Partial<CurrentSession> = {}) => {
    await act(async () => {
      reply.resolve(session({ active_students: activeStudents, ...fields }));
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

  it('orders a scan started before a poll by revision, not request start', async () => {
    const { result } = await renderPage();
    // Start just before the poll, keeping the answer within the 8s scan timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14000);
    });
    const answerScan = await startScan('revision-race');
    mockedApi.getCurrentSession.mockResolvedValueOnce(
      session({ active_students: 10, active_students_revision: 5 })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await answerScan(11, { active_students_session_id: 100, active_students_revision: 6 });
    expect(result.current.studentCount).toBe(11);
    mockedApi.getCurrentSession.mockResolvedValueOnce(
      session({ active_students: 10, active_students_revision: 5 })
    );
    await nextPollTick();
    expect(result.current.studentCount).toBe(11);
  });

  it.each(['session', 'room'] as const)(
    'keeps only greater %s revisions, including zero',
    async kind => {
      const { result } = await renderPage();
      const fields = (revision: number): Partial<RfidScanResponse> =>
        kind === 'session'
          ? { active_students_session_id: 100, active_students_revision: revision }
          : { active_students_room_id: 1, active_students_room_revision: revision };
      const answerA = await startScan('revision-a');
      const answerB = await startScan('revision-b');
      await answerB(12, fields(0));
      expect(result.current.studentCount).toBe(12);
      await answerA(99, fields(0));
      expect(result.current.studentCount).toBe(12);
      const answerC = await startScan('revision-c');
      await answerC(13, fields(2));
      expect(result.current.studentCount).toBe(13);
      const answerD = await startScan('revision-d');
      await answerD(99, fields(1));
      expect(result.current.studentCount).toBe(13);
      const answerE = await startScan('revision-e');
      await answerE(99, fields(2));
      expect(result.current.studentCount).toBe(13);
      const answerF = await startScan('revision-f');
      await answerF(14, fields(3));
      expect(result.current.studentCount).toBe(14);
      expect(mockedApi.processRfidScan).toHaveBeenCalledTimes(6);
    }
  );

  it.each(['session', 'room'] as const)(
    'accepts a higher %s revision from an earlier scan',
    async kind => {
      const { result } = await renderPage();
      const fields = (revision: number): Partial<RfidScanResponse> =>
        kind === 'session'
          ? { active_students_session_id: 100, active_students_revision: revision }
          : { active_students_room_id: 1, active_students_room_revision: revision };
      const answerA = await startScan('earlier-a');
      const answerB = await startScan('earlier-b');
      await answerB(12, fields(1));
      await answerA(13, fields(2));
      expect(result.current.studentCount).toBe(13);
    }
  );

  it('initializes the session revision from the store and ignores equal poll revisions', async () => {
    useUserStore.setState({
      currentSession: session({ active_students: 7, active_students_revision: 4 }),
    });
    mockedApi.getCurrentSession.mockResolvedValueOnce(
      session({ active_students: 99, active_students_revision: 4 })
    );
    const { result } = await renderPage();
    expect(result.current.studentCount).toBe(7);
  });

  it('never applies foreign or unscoped revisions as legacy counts', async () => {
    const { result } = await renderPage();
    for (const fields of [
      { active_students_session_id: 999, active_students_revision: 900 },
      { active_students_revision: 900 },
      { active_students_room_id: 999, active_students_room_revision: 900 },
      { active_students_room_revision: 900 },
    ]) {
      const answer = await startScan(`foreign-${JSON.stringify(fields)}`);
      await answer(99, fields);
      expect(result.current.studentCount).toBe(10);
    }
    mockedApi.getCurrentSession.mockResolvedValueOnce(
      session({ active_group_id: 999, active_students: 99, active_students_revision: 900 })
    );
    await nextPollTick();
    expect(result.current.studentCount).toBe(10);
  });

  it('does not compare room and session revisions', async () => {
    const { result } = await renderPage();
    const answerRoom = await startScan('room-count');
    await answerRoom(20, { active_students_room_id: 1, active_students_room_revision: 100 });
    const answerSession = await startScan('session-count');
    await answerSession(3, { active_students_session_id: 100, active_students_revision: 1 });
    expect(result.current.studentCount).toBe(3);
    const answerRoomAgain = await startScan('room-count-again');
    await answerRoomAgain(21, { active_students_room_id: 1, active_students_room_revision: 101 });
    expect(result.current.studentCount).toBe(21);
  });

  it.each(['session', 'room'] as const)(
    'resets %s revisions and rejects old scope answers',
    async kind => {
      const { result } = await renderPage();
      const fields = (id: number, revision: number): Partial<RfidScanResponse> =>
        kind === 'session'
          ? { active_students_session_id: id, active_students_revision: revision }
          : { active_students_room_id: id, active_students_room_revision: revision };
      const oldId = kind === 'session' ? 100 : 1;
      const answer = await startScan('old-count');
      await answer(12, fields(oldId, 100));
      const answerOldScan = await startScan('old-pending');
      const answerOldPoll = holdNextPoll();
      await nextPollTick();
      holdNextPoll();
      await act(async () => {
        useUserStore.setState({
          selectedRoom: { id: 2, name: 'Raum 2', is_occupied: true },
          currentSession: session({
            active_group_id: 200,
            room_id: 2,
            active_students: 3,
            active_students_revision: 0,
          }),
        });
      });
      await answerOldScan(99, fields(oldId, 200));
      await answerOldPoll(99, { active_students_revision: 200 });
      expect(result.current.studentCount).toBe(3);
      const newAnswer = await startScan('new-count');
      await newAnswer(4, fields(kind === 'session' ? 200 : 2, 1));
      expect(result.current.studentCount).toBe(4);
    }
  );

  it('rejects a revisioned answer from before remount in the same scope', async () => {
    const first = await renderPage();
    const answer = await startScan('before-remount');
    first.unmount();
    const { result } = await renderPage();
    await answer(99, { active_students_session_id: 100, active_students_revision: 999 });
    expect(result.current.studentCount).toBe(10);
  });

  it('starts a new revision on session change without changing activity or room', async () => {
    const { result } = await renderPage();
    const answer = await startScan('session-before-switch');
    await answer(12, { active_students_session_id: 100, active_students_revision: 100 });
    holdNextPoll();
    await act(async () => {
      useUserStore.setState({
        currentSession: session({
          active_group_id: 200,
          active_students: 3,
          active_students_revision: 0,
        }),
      });
    });
    const newAnswer = await startScan('session-after-switch');
    await newAnswer(4, { active_students_session_id: 200, active_students_revision: 1 });
    expect(result.current.studentCount).toBe(4);
  });

  it('keeps an equal poll revision idempotent even when its count differs', async () => {
    const answerPoll = holdNextPoll();
    const { result } = await renderPage();
    const answer = await startScan('equal-poll');
    await answer(12, { active_students_session_id: 100, active_students_revision: 0 });
    await answerPoll(99, { active_students_revision: 0 });
    expect(result.current.studentCount).toBe(12);
  });

  it('rejects a revisioned response after leaving and returning to the same scope', async () => {
    const { result } = await renderPage();
    const answerOld = await startScan('previous-scope-visit');
    holdNextPoll();
    await act(async () => {
      useUserStore.setState({ currentSession: session({ active_group_id: 200 }) });
    });
    holdNextPoll();
    await act(async () => {
      useUserStore.setState({ currentSession: session({ active_students: 3 }) });
    });
    await answerOld(99, { active_students_room_id: 1, active_students_room_revision: 999 });
    expect(result.current.studentCount).toBe(3);
  });

  it('uses legacy request ordering when a room count omits its revision', async () => {
    const { result } = await renderPage();
    const answerA = await startScan('legacy-room-a');
    const answerB = await startScan('legacy-room-b');
    await answerB(12, { active_students_room_id: 1 });
    await answerA(99, { active_students_room_id: 1 });
    expect(result.current.studentCount).toBe(12);
  });

  it('preserves destination revisions without applying their count to this room', async () => {
    const { result } = await renderPage();
    await act(async () => {
      useUserStore.getState().setScanResult({
        ...checkIn(99),
        isOpenRoom: true,
        active_students_room_id: 2,
        active_students_room_revision: 999,
      });
      useUserStore.getState().showScanModal();
    });
    expect(result.current.studentCount).toBe(10);
    expect(useUserStore.getState().rfid.currentScan).toMatchObject({
      active_students_room_id: 2,
      active_students_room_revision: 999,
    });
  });
});
