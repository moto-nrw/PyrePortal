import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { api, type CurrentSession } from '../services/api';
import type { SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import HomeViewPage from './HomeViewPage';

// ---------------------------------------------------------------------------
// Mock react-router-dom to intercept navigate calls
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Mock api module to control startSession
// ---------------------------------------------------------------------------
vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      startSession: vi.fn(),
      endSession: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockedApi = vi.mocked(api);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

const sessionSettingsWithLastSession: SessionSettings = {
  use_last_session: true,
  auto_save_enabled: true,
  last_session: {
    activity_id: 10,
    room_id: 5,
    supervisor_ids: [1, 2],
    saved_at: '2026-03-14T15:00:00Z',
    activity_name: 'Hausaufgaben',
    room_name: 'Raum A',
    supervisor_names: ['Frau Müller', 'Herr Schmidt'],
  },
};

const testActivity = { id: 10, name: 'Hausaufgaben', category: 'Betreuung' };
const testRoom = { id: 5, name: 'Raum A', is_occupied: false };

const startResponse = {
  active_group_id: 99,
  activity_id: 10,
  device_id: 1,
  start_time: '2026-03-15T10:00:00Z',
  supervisors: [],
  status: 'started',
  message: 'Activity session started successfully',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <HomeViewPage />
    </MemoryRouter>
  );
}

/** Open the recreation confirmation modal and click its confirm button */
async function confirmRecreation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Aufsicht wiederholen'));
  await waitFor(() => {
    expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
  });
  const startButtons = screen.getAllByText('Aufsicht starten');
  await user.click(startButtons[startButtons.length - 1]);
}

describe('HomeViewPage session recreation behavior', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockReset();
    mockedApi.startSession.mockResolvedValue(startResponse);
    useUserStore.setState({
      authenticatedUser: baseUser,
      currentSession: null,
      sessionSettings: sessionSettingsWithLastSession,
      isValidatingLastSession: false,
      error: null,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
      fetchCurrentSession: vi.fn(() => Promise.resolve()),
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      logout: vi.fn(() => Promise.resolve()),
      validateAndRecreateSession: vi.fn(() => Promise.resolve(true)),
      saveLastSessionData: vi.fn(() => Promise.resolve()),
    });
  });

  // =========================================================================
  // Success path
  // =========================================================================

  it('recreates the session, sets currentSession, saves last session data and navigates', async () => {
    const saveLastSessionData = vi.fn(() => Promise.resolve());
    useUserStore.setState({ saveLastSessionData });

    const user = userEvent.setup();
    renderPage();
    await confirmRecreation(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });

    expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
      activity_id: 10,
      room_id: 5,
      supervisor_ids: [1, 2],
    });
    expect(saveLastSessionData).toHaveBeenCalled();
    expect(useUserStore.getState().currentSession).toMatchObject({
      active_group_id: 99,
      activity_id: 10,
      activity_name: 'Hausaufgaben',
      room_id: 5,
      room_name: 'Raum A',
      duration: '0s',
      is_active: true,
      active_students: 0,
    } satisfies Partial<CurrentSession>);
  });

  // =========================================================================
  // Network error path
  // =========================================================================

  it('shows the specific network error message when recreation fails with a network error', async () => {
    mockedApi.startSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    renderPage();
    await confirmRecreation(user);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Netzwerkfehler beim Starten der Aktivität. Bitte Verbindung prüfen und erneut versuchen.'
        )
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/nfc-scanning');
  });

  // =========================================================================
  // Request-id race guard: stale async responses are discarded
  // =========================================================================

  it('discards a stale error response after logout invalidated the request id', async () => {
    let rejectStart: (error: unknown) => void = () => {};
    mockedApi.startSession.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStart = reject;
        })
    );

    const user = userEvent.setup();
    renderPage();
    await confirmRecreation(user);

    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalled();
    });

    // Logout while the recreation request is still in flight invalidates it
    await user.click(screen.getByText('Abmelden'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    // Now the stale request fails; the error must be discarded silently
    rejectStart(new Error('Stale server error'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.queryAllByText(content => content.includes('Stale server error'))).toHaveLength(
      0
    );
    // The confirmation modal state is left untouched by the stale response
    expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
  });

  it('still applies a stale success response (current behavior: success path is unguarded)', async () => {
    let resolveStart: (value: typeof startResponse) => void = () => {};
    mockedApi.startSession.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveStart = resolve;
        })
    );

    const user = userEvent.setup();
    renderPage();
    await confirmRecreation(user);

    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalled();
    });

    // Logout invalidates the request id while the request is in flight
    await user.click(screen.getByText('Abmelden'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    // The late success still sets the session and navigates (unguarded today)
    resolveStart(startResponse);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });
    expect(useUserStore.getState().currentSession).toMatchObject({ active_group_id: 99 });
  });

  it('discards a stale error when a second recreation attempt superseded the first', async () => {
    let rejectFirst: (error: unknown) => void = () => {};
    mockedApi.startSession
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockResolvedValueOnce(startResponse);

    const user = userEvent.setup();
    renderPage();
    await confirmRecreation(user);

    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
    });

    // Second confirm click supersedes the first request
    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });

    // The stale first request now fails; no error modal may appear
    rejectFirst(new Error('First request failed late'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(
      screen.queryAllByText(content => content.includes('First request failed late'))
    ).toHaveLength(0);
  });
});
