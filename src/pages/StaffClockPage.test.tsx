import { adapter } from '@platform';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, type StaffClockState } from '../services/api';
import { useUserStore } from '../store/userStore';

import StaffClockPage, { __resetUnresolvedMutations } from './StaffClockPage';

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
    // Fences outlive the component on purpose, so they also outlive a test.
    __resetUnresolvedMutations();
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
    expect(mockedApi.getStaffClockState).toHaveBeenCalledWith(
      '1234',
      '04:A1:B2:C3:D4:E5:F6',
      undefined,
      expect.any(AbortSignal)
    );
    expect(screen.getByText('Ausgestempelt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einstempeln' })).toBeInTheDocument();
  });

  it('always stamps as present, without offering a work location', async () => {
    const user = userEvent.setup();
    renderPage();
    await scanCard(user);

    // Being at the kiosk is the proof of being on site — there is nothing to choose.
    expect(screen.queryByRole('button', { name: 'Homeoffice' })).not.toBeInTheDocument();
    expect(screen.queryByText('Arbeitsort wählen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));

    await waitFor(() =>
      expect(mockedApi.executeStaffClockAction).toHaveBeenCalledWith(
        '1234',
        {
          rfid_tag: '04:A1:B2:C3:D4:E5:F6',
          action: 'checkin',
          status: 'present',
        },
        17,
        expect.any(AbortSignal)
      )
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
    expect(mockedApi.executeStaffClockAction).toHaveBeenLastCalledWith(
      '1234',
      {
        rfid_tag: '04:A1:B2:C3:D4:E5:F6',
        action: 'checkin',
        status: 'present',
        reason: 'Vertretung übernommen',
      },
      17,
      expect.any(AbortSignal)
    );
  });

  it('drops the credential when the server rejects an action as stale', async () => {
    const user = userEvent.setup();
    mockedApi.executeStaffClockAction.mockRejectedValueOnce(
      new ApiError('invalid state', 409, 'invalid_staff_clock_state')
    );
    renderPage();
    await scanCard(user);

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));

    expect(await screen.findByText(/Bitte Armband erneut scannen/)).toBeInTheDocument();
    // Reloading the actions here would put a fresh, usable action set for this
    // employee on screen without anyone having scanned — and the wristband may
    // simply be lying on the kiosk. The card goes instead.
    expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Mara Muster')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einstempeln' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ausstempeln' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Armband scannen' })).toBeEnabled();
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

  it('settles a rejected stamp against the backend before freeing the card', async () => {
    vi.useFakeTimers();
    try {
      let failAction: ((error: Error) => void) | undefined;
      mockedApi.executeStaffClockAction.mockReturnValue(
        new Promise((_resolve, reject) => {
          failAction = reject;
        })
      );
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(1);

      // The outstanding call reports back — but a rejection is no proof that
      // nothing was written, so the backend, not a timer, has to settle it.
      failAction?.(new Error('connection reset'));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(2);
      // One read showing the pre-stamp state is not an answer: a commit can
      // still land in the next instant. The card stays fenced.
      expect(screen.queryByText('Mara Muster')).toBeNull();

      // A second read a full gap later, still without the stamp, is — and only
      // behind it does the held scan get its own read.
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(4);
      expect(screen.getByText('Mara Muster')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('frees the card as soon as a reconciling read shows the stamp landed', async () => {
    vi.useFakeTimers();
    try {
      let failAction: ((error: Error) => void) | undefined;
      mockedApi.executeStaffClockAction.mockReturnValue(
        new Promise((_resolve, reject) => {
          failAction = reject;
        })
      );
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      // The check-in did commit; only its answer was lost. Seeing the state the
      // action produces is conclusive on its own — nothing more can land.
      mockedApi.getStaffClockState.mockResolvedValue(checkedInState);
      failAction?.(new Error('connection reset'));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.queryByText(/vorherige Stempelung wird noch verarbeitet/)).toBeNull();
      expect(screen.getByText('Eingestempelt')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a card fenced when another card also loses its answer', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      renderPage();

      // Card A stamps and never hears back.
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      // Card B does the same. Its fence must not lift card A's.
      mockedScan.mockResolvedValue({ success: true, tag_id: '04:99:88:77:66:55:44' });
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      const readsBefore = mockedApi.getStaffClockState.mock.calls.length;
      mockedScan.mockResolvedValue({ success: true, tag_id: '04:A1:B2:C3:D4:E5:F6' });
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(20_000));

      expect(screen.getByText(/vorherige Stempelung wird noch verarbeitet/)).toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the fence after leaving and reopening the page', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      const view = renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      // Unmounting does not abort the outstanding write, so the fence has to
      // survive the trip back to the home view.
      view.unmount();
      renderPage();

      const readsBefore = mockedApi.getStaffClockState.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(20_000));

      expect(screen.getByText(/vorherige Stempelung wird noch verarbeitet/)).toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fences a card while its stamp is still in flight, before any deadline', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      const view = renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      // Well inside the request deadline: the write is live and undecided.
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      // Leaving and coming back must not open a window for a second stamp.
      view.unmount();
      renderPage();

      const readsBefore = mockedApi.getStaffClockState.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(20_000));

      expect(screen.getByText(/vorherige Stempelung wird noch verarbeitet/)).toBeInTheDocument();
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores Escape in the reason dialog while the stamp is in flight', async () => {
    const user = userEvent.setup();
    mockedApi.executeStaffClockAction
      .mockRejectedValueOnce(
        new ApiError('deviation reason required', 409, 'deviation_reason_required', {
          deviation_minutes: '22',
        })
      )
      .mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    await scanCard(user);

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));
    await screen.findByText(/weicht um 22 Minuten/);
    await user.type(screen.getByLabelText('Begründung'), 'Vertretung übernommen');
    await user.click(screen.getByRole('button', { name: 'Erneut stempeln' }));

    // The retry is on its way and cannot be recalled, so the native cancel is
    // refused — closing here would read as "not stamped" while it still commits.
    const dialog = screen.getByLabelText('Begründung').closest('dialog');
    const cancelled = dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toBe(false);
    expect(screen.getByText(/weicht um 22 Minuten/)).toBeInTheDocument();
    expect(screen.getByLabelText('Begründung')).toHaveValue('Vertretung übernommen');
  });

  it('lifts a fence whose mutation never reports back at all', async () => {
    vi.useFakeTimers();
    try {
      // A call that neither answers nor fails cannot lift its own fence.
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      const readsBefore = mockedApi.getStaffClockState.mock.calls.length;

      // The kiosk in the hallway has nobody to restart it, so the fence must
      // resolve by itself rather than burn 20s on every further scan forever.
      await act(() => vi.advanceTimersByTimeAsync(120_000));

      // What resolves it is the backend, not a timer: the cancelled stamp is
      // reconciled by reads that agree the check-in never landed.
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore + 2);

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore + 3);
      expect(screen.queryByText(/vorherige Stempelung wird noch verarbeitet/)).toBeNull();
      expect(screen.getByText('Mara Muster')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a cancelled stamp fenced until the backend has reconciled it', async () => {
    vi.useFakeTimers();
    try {
      let stampSignal: AbortSignal | undefined;
      mockedApi.executeStaffClockAction.mockImplementation((_pin, _command, _staffId, signal) => {
        stampSignal = signal;
        return new Promise(() => {});
      });
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      expect(stampSignal?.aborted).toBe(false);

      // Hold the reconciling read open: it is the only thing allowed to end
      // this fence, so the test can watch the card stay locked without it.
      let answerReconcile: ((state: StaffClockState) => void) | undefined;
      mockedApi.getStaffClockState.mockImplementation(
        () =>
          new Promise(resolve => {
            answerReconcile = resolve;
          })
      );

      // At the ceiling the stamp is cancelled first. Nothing is asked yet: a
      // read taken beside a request that is still coming apart would describe a
      // moment, not an outcome.
      await act(() => vi.advanceTimersByTimeAsync(95_001));
      expect(stampSignal?.aborted).toBe(true);
      const readsAfterAbort = mockedApi.getStaffClockState.mock.calls.length;
      expect(readsAfterAbort).toBe(1);

      // Only once the cancelled call has had its bounded chance to come apart
      // does the single reconciliation path start asking.
      await act(() => vi.advanceTimersByTimeAsync(5_001));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsAfterAbort + 1);

      // Cancelling is not an answer. While the backend has not spoken, no scan
      // of this card gets through to a read.
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsAfterAbort + 1);

      // The backend answers, and the check-in is not there. That alone is not
      // an answer either — a commit can land in the very next instant — so the
      // card stays fenced and a second read is taken a full gap later.
      answerReconcile?.(checkedOutState);
      mockedApi.getStaffClockState.mockResolvedValue(checkedOutState);
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsAfterAbort + 1);
      expect(screen.queryByText('Mara Muster')).toBeNull();

      // Two reads agreeing across the gap settle it — now the held scan goes
      // through and gets its own read.
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsAfterAbort + 3);
      expect(screen.queryByText(/vorherige Stempelung wird noch verarbeitet/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the card when the backend never reconciles the cancelled stamp', async () => {
    vi.useFakeTimers();
    try {
      mockedApi.executeStaffClockAction.mockReturnValue(new Promise(() => {}));
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      // A backend that answers nothing at all cannot reconcile anything either.
      mockedApi.getStaffClockState.mockReturnValue(new Promise(() => {}));
      await act(() => vi.advanceTimersByTimeAsync(95_001));

      // The teardown wait, then three bounded attempts, then the card is handed
      // back anyway: a hallway kiosk that fences a card forever is broken for
      // everyone behind it.
      await act(() => vi.advanceTimersByTimeAsync(60_001));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(4);

      mockedApi.getStaffClockState.mockResolvedValue(checkedOutState);
      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.queryByText(/vorherige Stempelung wird noch verarbeitet/)).toBeNull();
      expect(screen.getByText('Mara Muster')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles a cancelled stamp on exactly one path', async () => {
    vi.useFakeTimers();
    try {
      // A stamp that answers its abort, which is the normal case: the cancelled
      // call rejects. That rejection and the timer that caused it must not both
      // pick up the reconciliation and put two loops on the same card.
      mockedApi.executeStaffClockAction.mockImplementation(
        (_pin, _command, _staffId, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      fireEvent.click(screen.getByRole('button', { name: 'Einstempeln' }));
      await act(() => vi.advanceTimersByTimeAsync(25_000));

      const readsBefore = mockedApi.getStaffClockState.mock.calls.length;
      mockedApi.getStaffClockState.mockResolvedValue(checkedOutState);

      // The abort tears the call down at once, so reconciliation starts here —
      // once, not once per party that noticed the cancellation.
      await act(() => vi.advanceTimersByTimeAsync(95_001));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore + 1);

      // And one read per gap after that, until the card is settled.
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(mockedApi.getStaffClockState).toHaveBeenCalledTimes(readsBefore + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the scan when its state read times out, and cancels that read', async () => {
    vi.useFakeTimers();
    try {
      let readSignal: AbortSignal | undefined;
      mockedApi.getStaffClockState.mockImplementation((_pin, _tag, _staffId, signal) => {
        readSignal = signal;
        return new Promise(() => {});
      });
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Armband scannen' }));
      await act(() => vi.advanceTimersByTimeAsync(15_000));

      // Nothing was written by a read, so waiting for it is pointless — and its
      // answer would describe a card that is no longer at the reader.
      expect(readSignal?.aborted).toBe(true);
      expect(screen.getByText(/Server antwortet nicht/)).toBeInTheDocument();

      // The scan authorized nothing: no name, no actions, no held credential.
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(screen.queryByText('Mara Muster')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Einstempeln' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Armband scannen' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends the scanned employee as the actor of the stamp', async () => {
    const user = userEvent.setup();
    renderPage();
    await scanCard(user);

    // The first read has no actor yet — resolving the tag to a person is what
    // it is for. The stamp that follows carries the employee it resolved to.
    expect(mockedApi.getStaffClockState).toHaveBeenCalledWith(
      '1234',
      '04:A1:B2:C3:D4:E5:F6',
      undefined,
      expect.any(AbortSignal)
    );

    await user.click(screen.getByRole('button', { name: 'Einstempeln' }));

    expect(mockedApi.executeStaffClockAction).toHaveBeenCalledWith(
      '1234',
      { rfid_tag: '04:A1:B2:C3:D4:E5:F6', action: 'checkin', status: 'present' },
      17,
      expect.any(AbortSignal)
    );
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
