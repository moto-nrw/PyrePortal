import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCAN_TIMEOUT_MS } from '../hooks/useRfidScanning';
import type { NfcScanEvent } from '../platform/adapter';
import { api, type CurrentSession, type RfidScanResponse } from '../services/api';
import { useUserStore } from '../store/userStore';

import ActivityScanningPage from './ActivityScanningPage';

// The page, its view model and the real scan hook run; only the platform
// adapter and the HTTP API are faked.
vi.mock('@platform', () => ({
  adapter: {
    platform: 'gkt',
    initializeNfc: vi.fn().mockResolvedValue(undefined),
    startScanning: vi.fn(),
    stopScanning: vi.fn().mockResolvedValue(undefined),
    getServiceStatus: vi.fn().mockResolvedValue({ is_running: true }),
  },
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    api: {
      getCurrentSession: vi.fn(),
      getRooms: vi.fn(),
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
      toggleAttendance: vi.fn(),
      updateSessionActivity: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const { adapter } = await import('@platform');
const mockedApi = vi.mocked(api);

const NOTICE_TITLE = 'Scan nicht bestätigt';
const NOTICE_MESSAGE = 'Bitte nicht noch einmal scannen. Bitte die Betreuung fragen.';
const TAG_A = '04:AA:AA:AA:AA:AA:AA';
const TAG_B = '04:BB:BB:BB:BB:BB:BB';

const session = (): CurrentSession => ({
  active_group_id: 100,
  activity_id: 1,
  activity_name: 'Nachmittagsbetreuung',
  room_id: 1,
  room_name: 'Raum 101',
  device_id: 1,
  start_time: '2026-10-27T08:00:00Z',
  duration: '1h',
  is_active: true,
  active_students: 10,
});

const checkoutOfBerta = (): RfidScanResponse => ({
  student_id: 2,
  student_name: 'Berta Beispiel',
  action: 'checked_out',
  visit_id: 200,
  daily_checkout_available: true,
  feedback_enabled: true,
  active_students: 9,
});

const hangingScan = () => new Promise<RfidScanResponse>(() => undefined);

let onScan: (event: NfcScanEvent) => void = () => undefined;
let scanId = 0;

async function scan(tagId: string) {
  await act(async () => {
    onScan({ tagId, scanId: ++scanId });
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderPage() {
  render(
    <MemoryRouter>
      <ActivityScanningPage />
    </MemoryRouter>
  );
  await advance(0);
}

describe('ActivityScanningPage scan timeout notice', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(adapter.startScanning).mockImplementation(async callback => {
      onScan = callback;
    });
    mockedApi.getCurrentSession.mockResolvedValue(session());
    mockedApi.getRooms.mockResolvedValue([
      { id: 50, name: 'Schulhof', is_occupied: false, is_schulhof: true },
    ]);
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
      currentSession: session(),
      selectedSupervisors: [{ id: 7, name: 'Betreuung' }],
    });
  });

  afterEach(async () => {
    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('replaces the feedback prompt of a newer scan with the notice', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.processRfidScan
      .mockImplementationOnce(hangingScan)
      .mockResolvedValueOnce(checkoutOfBerta());
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'success',
      data: { feedback_enabled: true },
    } as never);
    await renderPage();

    await scan(TAG_A);
    await advance(5000);
    await scan(TAG_B);
    await user.click(screen.getByRole('button', { name: 'nach Hause' }));
    await advance(0);
    expect(screen.getByText('Wie war dein Tag, Berta?')).toBeInTheDocument();

    await advance(SCAN_TIMEOUT_MS - 5000);

    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(NOTICE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Wie war dein Tag, Berta?')).not.toBeInTheDocument();
    expect(useUserStore.getState().rfid.processingQueue.size).toBe(0);
  });

  it('replaces the farewell of a newer scan with the notice', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.processRfidScan
      .mockImplementationOnce(hangingScan)
      .mockResolvedValueOnce(checkoutOfBerta());
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'success',
      data: { feedback_enabled: false },
    } as never);
    await renderPage();

    await scan(TAG_A);
    await advance(7000);
    await scan(TAG_B);
    await user.click(screen.getByRole('button', { name: 'nach Hause' }));
    await advance(0);
    expect(screen.getByText('Tschüss, Berta!')).toBeInTheDocument();

    await advance(SCAN_TIMEOUT_MS - 7000);

    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Tschüss, Berta!')).not.toBeInTheDocument();
  });

  it('shows a refused scan of another child instead of the feedback prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.processRfidScan
      .mockResolvedValueOnce(checkoutOfBerta())
      .mockRejectedValueOnce(new Error('refused'));
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'success',
      data: { feedback_enabled: true },
    } as never);
    await renderPage();

    await scan(TAG_B);
    await user.click(screen.getByRole('button', { name: 'nach Hause' }));
    await advance(0);
    expect(screen.getByText('Wie war dein Tag, Berta?')).toBeInTheDocument();

    await scan(TAG_A);

    expect(screen.getByText('Scan fehlgeschlagen')).toBeInTheDocument();
    expect(screen.queryByText('Wie war dein Tag, Berta?')).not.toBeInTheDocument();
  });

  it('replaces the destination chooser when a repeated scan of the same child times out', async () => {
    mockedApi.processRfidScan
      .mockResolvedValueOnce(checkoutOfBerta())
      .mockImplementationOnce(hangingScan);
    await renderPage();

    await scan(TAG_B);
    expect(screen.getByText('Wohin geht Berta?')).toBeInTheDocument();
    await scan(TAG_B);
    await advance(SCAN_TIMEOUT_MS);

    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Wohin geht Berta?')).not.toBeInTheDocument();
  });

  it('keeps the notice when a pending Schulhof booking of a newer scan answers later', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let answerSchulhof: (value: RfidScanResponse) => void = () => undefined;
    mockedApi.processRfidScan
      .mockImplementationOnce(hangingScan)
      .mockResolvedValueOnce(checkoutOfBerta())
      .mockImplementationOnce(
        () =>
          new Promise<RfidScanResponse>(resolve => {
            answerSchulhof = resolve;
          })
      );
    await renderPage();

    await scan(TAG_A);
    await advance(5000);
    await scan(TAG_B);
    await user.click(await screen.findByRole('button', { name: 'Schulhof' }));
    await advance(SCAN_TIMEOUT_MS - 5000);
    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();

    await act(async () => {
      answerSchulhof({
        student_id: 2,
        student_name: 'Berta Beispiel',
        action: 'checked_in',
        room_name: 'Schulhof',
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();
  });

  it('shows the notice after a supervisor card answered in between', async () => {
    mockedApi.processRfidScan.mockImplementationOnce(hangingScan).mockResolvedValueOnce({
      student_id: 7,
      student_name: 'Frau Betreuung',
      action: 'supervisor_authenticated',
      message: 'ok',
    });
    await renderPage();

    await scan(TAG_A);
    await advance(5000);
    await scan(TAG_B);
    await advance(SCAN_TIMEOUT_MS - 5000);

    expect(screen.getByText(NOTICE_TITLE)).toBeInTheDocument();
  });

  it('keeps the pickup query unavailable while a scan is unanswered', async () => {
    mockedApi.processRfidScan.mockImplementationOnce(hangingScan);
    await renderPage();

    await scan(TAG_A);

    expect(screen.getByRole('button', { name: 'Abholzeit abfragen' })).toBeDisabled();
  });
});
