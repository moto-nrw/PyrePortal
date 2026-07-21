import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adapter } from '@platform';

import { ApiError, api, type StaffClockState } from '../services/api';
import { useUserStore } from '../store/userStore';

import StaffClockPage from './StaffClockPage';

vi.mock('@platform', () => ({
  adapter: {
    platform: 'gkt',
    scanSingleTag: vi.fn(),
  },
}));

vi.mock('../platform/adapter', async () => {
  const actual =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    await vi.importActual<typeof import('../platform/adapter')>('../platform/adapter');
  return { ...actual, isRealScanningEnabled: vi.fn(() => true) };
});

vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getStaffClockState: vi.fn(),
      executeStaffClockAction: vi.fn(),
    },
  };
});

const checkedOutState: StaffClockState = {
  staff_id: 17,
  staff_name: 'Mara Muster',
  state: 'checked_out',
  allowed_actions: ['checkin'],
  net_minutes: 0,
  break_minutes: 0,
  required_break_minutes: 0,
  is_break_compliant: true,
};

const checkedInState: StaffClockState = {
  ...checkedOutState,
  state: 'checked_in',
  allowed_actions: ['break_start', 'checkout'],
  net_minutes: 370,
  break_minutes: 0,
  required_break_minutes: 30,
  is_break_compliant: false,
  session: {
    id: 91,
    staff_id: 17,
    check_in_time: '2026-07-21T08:00:00+02:00',
    status: 'present',
    source: 'nfc',
  },
};

const mockedApi = vi.mocked(api);
const mockedScan = vi.mocked(adapter.scanSingleTag);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/staff-clock']}>
      <StaffClockPage />
    </MemoryRouter>
  );
}

async function scanCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Armband scannen' }));
  await screen.findByText('Mara Muster');
}

describe('StaffClockPage', () => {
  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: clearing keeps queued mock*Once
    // implementations alive, so an unconsumed one-shot leaks into the next test.
    vi.resetAllMocks();
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Kiosk User',
        deviceName: 'Kiosk',
        pin: '1234',
      },
    });
    mockedScan.mockResolvedValue({ success: true, tag_id: '04:A1:B2:C3:D4:E5:F6' });
    mockedApi.getStaffClockState.mockResolvedValue(checkedOutState);
    mockedApi.executeStaffClockAction.mockResolvedValue(checkedInState);
  });

  it('scans a personal card and loads its authoritative state', async () => {
    const user = userEvent.setup();
    renderPage();

    await scanCard(user);

    expect(mockedScan).toHaveBeenCalledWith(20_000);
    expect(mockedApi.getStaffClockState).toHaveBeenCalledWith('1234', '04:A1:B2:C3:D4:E5:F6');
    expect(screen.getByText('Ausgestempelt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einstempeln' })).toBeInTheDocument();
  });

  it('sends the selected home-office status when checking in', async () => {
    const user = userEvent.setup();
    renderPage();
    await scanCard(user);

    await user.click(screen.getByRole('button', { name: 'Homeoffice' }));
    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));

    await waitFor(() =>
      expect(mockedApi.executeStaffClockAction).toHaveBeenCalledWith('1234', {
        rfid_tag: '04:A1:B2:C3:D4:E5:F6',
        action: 'checkin',
        status: 'home_office',
      })
    );
    expect(await screen.findByText('Eingestempelt')).toBeInTheDocument();
    expect(
      screen.getByText(/muss das persönliche Armband erneut gescannt werden/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause starten' })).not.toBeInTheDocument();
  });

  it('shows both legal break guidance and the actions allowed by the server', async () => {
    const user = userEvent.setup();
    mockedApi.getStaffClockState.mockResolvedValue(checkedInState);
    renderPage();

    await scanCard(user);

    expect(screen.getByText(/mindestens 30 Minuten Pause/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause starten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausstempeln' })).toBeInTheDocument();
  });

  it('collects a reason and retries a deviation without rescanning', async () => {
    const user = userEvent.setup();
    mockedApi.executeStaffClockAction
      .mockRejectedValueOnce(
        new ApiError('deviation reason required', 409, 'deviation_reason_required', {
          deviation_minutes: '22',
        })
      )
      .mockResolvedValueOnce(checkedInState);
    renderPage();
    await scanCard(user);

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));
    expect(await screen.findByText(/weicht um 22 Minuten/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Begründung'), 'Vertretung übernommen');
    await user.click(screen.getByRole('button', { name: 'Erneut stempeln' }));

    await waitFor(() => expect(mockedApi.executeStaffClockAction).toHaveBeenCalledTimes(2));
    expect(mockedApi.executeStaffClockAction).toHaveBeenLastCalledWith('1234', {
      rfid_tag: '04:A1:B2:C3:D4:E5:F6',
      action: 'checkin',
      status: 'present',
      reason: 'Vertretung übernommen',
    });
  });

  it('reloads the authoritative state when the server rejects a stale action', async () => {
    const user = userEvent.setup();
    mockedApi.getStaffClockState
      .mockResolvedValueOnce(checkedOutState)
      .mockResolvedValueOnce(checkedInState);
    mockedApi.executeStaffClockAction.mockRejectedValueOnce(
      new ApiError('invalid state', 409, 'invalid_staff_clock_state')
    );
    renderPage();
    await scanCard(user);

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));

    expect(
      await screen.findByText('Diese Aktion passt nicht zum aktuellen Stempelstatus.')
    ).toBeInTheDocument();
    await waitFor(() => expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Eingestempelt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einstempeln' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausstempeln' })).toBeInTheDocument();
  });

  it('recovers when a backend request never answers', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.getStaffClockState.mockReturnValue(new Promise(() => {}));
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(15_000));

      expect(
        screen.getByText('Server antwortet nicht. Bitte erneut versuchen.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Armband scannen' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a clock answer that arrives inside the grace window', async () => {
    vi.useFakeTimers();
    try {
      // The POST misses the 15s deadline but still answers within the 10s grace
      // period — that late answer is authoritative and must be taken as success.
      let resolveAction: ((state: StaffClockState) => void) | undefined;
      mockedApi.executeStaffClockAction.mockReturnValue(
        new Promise(resolve => {
          resolveAction = resolve;
        })
      );
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(15_000));

      // Still undecided: no verdict is shown and no read is fired beside the
      // outstanding write, which could return pre-mutation state.
      expect(screen.queryByText(/konnte nicht bestätigt werden/)).not.toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);

      resolveAction?.(checkedInState);
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByText('Einstempeln erfolgreich')).toBeInTheDocument();
      expect(screen.getByText('Eingestempelt')).toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the credential when a clock action is never confirmed', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      // 15s deadline plus the 10s grace period, after which the outcome stays unknown.
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      expect(screen.getByText(/Armband erneut scannen und Status prüfen/)).toBeInTheDocument();
      expect(screen.queryByText('Mara Muster')).not.toBeInTheDocument();
      expect(screen.queryByText('Einstempeln erfolgreich')).not.toBeInTheDocument();
      // No reconciling read: it could race the write that is still outstanding.
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Armband scannen' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to read state while the unconfirmed action is still outstanding', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      // Rescanning the same card must not read state beside the write that is
      // still in flight — that read can predate the commit and would re-offer an
      // action the employee has effectively already taken.
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(20_000));
      expect(screen.getByText(/vorherige Stempelung wird noch verarbeitet/)).toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads state again once the unconfirmed action finally settles', async () => {
    vi.useFakeTimers();
    try {
      let failAction: ((error: Error) => void) | undefined;
      mockedApi.executeStaffClockAction.mockReturnValue(
        new Promise((_resolve, reject) => {
          failAction = reject;
        })
      );
      mockedApi.getStaffClockState
        .mockResolvedValueOnce(checkedOutState)
        .mockResolvedValueOnce(checkedInState);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);

      // The outstanding call reports back: nothing can commit behind it anymore,
      // so the waiting scan may now trust what it reads.
      failAction?.(new Error('connection reset'));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Eingestempelt')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not launch a second scan while the first one is pending', async () => {
    const user = userEvent.setup();
    let resolveScan: ((value: { success: true; tag_id: string }) => void) | undefined;
    mockedScan.mockReturnValue(
      new Promise(resolve => {
        resolveScan = resolve;
      })
    );
    renderPage();

    const scanButton = screen.getByRole('button', { name: 'Armband scannen' });
    await user.click(scanButton);
    await user.click(scanButton);
    expect(mockedScan).toHaveBeenCalledTimes(1);

    resolveScan?.({ success: true, tag_id: '04:A1:B2:C3:D4:E5:F6' });
    expect(await screen.findByText('Mara Muster')).toBeInTheDocument();
  });
});
