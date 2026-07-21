import { render, screen, waitFor } from '@testing-library/react';
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
    vi.clearAllMocks();
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Kiosk User',
        deviceName: 'Kiosk',
        authenticatedAt: new Date(),
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
