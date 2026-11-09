import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, NetworkError, type CurrentSession } from '../services/api';
import { useUserStore } from '../store/userStore';

import HomeViewPage from './HomeViewPage';

// Issue #512 (IO-8/KI-10): ending a session never fails silently. The
// server's state after a failed answer decides what the kiosk shows.

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      endSession: vi.fn(),
      getCurrentSession: vi.fn(),
      getActivities: vi.fn().mockResolvedValue([]),
      getRooms: vi.fn().mockResolvedValue([]),
    },
  };
});

const mockedApi = vi.mocked(api);

const FAILURE_TEXT = 'Die Aufsicht wurde nicht beendet. Bitte noch einmal versuchen.';

/** The failure modal stays in the DOM; only an open dialog is visible. */
const isFailureShown = () => screen.queryByText(FAILURE_TEXT)?.closest('dialog')?.open === true;

const activeSession: CurrentSession = {
  active_group_id: 42,
  activity_id: 10,
  activity_name: 'Hausaufgaben',
  room_id: 5,
  room_name: 'Raum A',
  device_id: 1,
  start_time: '2026-11-09T10:00:00Z',
  duration: '01:30:00',
  is_active: true,
};

async function endSessionFromHome() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <HomeViewPage />
    </MemoryRouter>
  );
  await user.click(screen.getByText('Aufsicht beenden'));
  await user.click(screen.getAllByText('Ja, beenden')[0]);
}

describe('HomeViewPage ending a session (#512)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      ...useUserStore.getInitialState(),
      authenticatedUser: { staffId: 1, staffName: 'Test', deviceName: 'Kiosk', pin: '1234' },
      currentSession: activeSession,
      loadSessionSettings: vi.fn(() => Promise.resolve()),
    });
    // The page asks for the session when it opens; the server still runs it.
    mockedApi.getCurrentSession.mockResolvedValue(activeSession);
  });

  it('treats a session that is already gone as ended', async () => {
    mockedApi.endSession.mockRejectedValue(
      new ApiError('API Error: 400', 400, 'iot.no_session_to_end')
    );
    mockedApi.getCurrentSession.mockResolvedValueOnce(activeSession).mockResolvedValue(null);

    await endSessionFromHome();

    await waitFor(() => {
      expect(useUserStore.getState().currentSession).toBeNull();
    });
    expect(isFailureShown()).toBe(false);
  });

  it('counts the end as done when the server reports no session after a lost answer', async () => {
    mockedApi.endSession.mockRejectedValue(new NetworkError('Keine Netzwerkverbindung.'));
    mockedApi.getCurrentSession.mockResolvedValueOnce(activeSession).mockResolvedValue(null);

    await endSessionFromHome();

    await waitFor(() => {
      expect(useUserStore.getState().currentSession).toBeNull();
    });
    expect(isFailureShown()).toBe(false);
  });

  it('shows a message and keeps the session when the server still runs it', async () => {
    mockedApi.endSession.mockRejectedValue(new ApiError('API Error: 500', 500));

    await endSessionFromHome();

    await waitFor(() => {
      expect(isFailureShown()).toBe(true);
    });
    expect(useUserStore.getState().currentSession?.active_group_id).toBe(42);
    expect(mockedApi.getCurrentSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
