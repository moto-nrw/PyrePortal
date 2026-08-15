import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { api, type CurrentSession } from '../services/api';
import type { SessionHistoryEntry, SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import SessionHistoryPage from './SessionHistoryPage';

// ---------------------------------------------------------------------------
// Mock react-router to intercept navigate calls
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
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
      getActivities: vi.fn(),
      getRooms: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

// Real store action, captured before any test overrides it via setState
const realValidateAndRecreateSession = useUserStore.getState().validateAndRecreateSession;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

const historyEntry: SessionHistoryEntry = {
  activity_id: 10,
  room_id: 5,
  supervisor_ids: [1, 2],
  saved_at: '2026-03-14T15:00:00Z',
  activity_name: 'Hausaufgaben',
  room_name: 'Raum A',
  supervisor_names: ['Frau Müller', 'Herr Schmidt'],
};

const sessionSettingsWithHistory: SessionSettings = {
  auto_save_enabled: true,
  session_history: [historyEntry],
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
      <SessionHistoryPage />
    </MemoryRouter>
  );
}

/** Select the saved combination and wait for the confirmation modal */
async function openRecreationConfirm(user: ReturnType<typeof userEvent.setup>) {
  const entryRow = await screen.findByText(/Raum A · /);
  await user.click(entryRow.closest('button')!);
  await waitFor(() => {
    expect(screen.getByText('Neue Aufsicht starten?')).toBeInTheDocument();
  });
}

/** Open the recreation confirmation modal and click its confirm button */
async function confirmRecreation(user: ReturnType<typeof userEvent.setup>) {
  await openRecreationConfirm(user);
  const startButtons = screen.getAllByText('Aufsicht starten');
  await user.click(startButtons[startButtons.length - 1]);
}

/**
 * Invalidate the in-flight recreation the same way a logout does
 * (performLogout on the home page calls invalidateSessionRecreation).
 */
function invalidateLikeLogout() {
  useUserStore.getState().invalidateSessionRecreation();
}

describe('SessionHistoryPage session recreation behavior', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockReset();
    mockedApi.startSession.mockResolvedValue(startResponse);
    useUserStore.setState({
      authenticatedUser: baseUser,
      currentSession: null,
      sessionSettings: sessionSettingsWithHistory,
      isValidatingLastSession: false,
      error: null,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      validateAndRecreateSession: vi.fn(() => Promise.resolve({ status: 'success' as const })),
      saveLastSessionData: vi.fn(() => Promise.resolve()),
      removeSessionHistoryEntry: vi.fn(() => Promise.resolve()),
      clearSessionHistory: vi.fn(() => Promise.resolve()),
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

  it('discards a stale error response after an invalidation (logout) while in flight', async () => {
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

    // A logout elsewhere invalidates the in-flight recreation request
    invalidateLikeLogout();

    // Now the stale request fails; the error must be discarded silently
    rejectStart(new Error('Stale server error'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.queryAllByText(content => content.includes('Stale server error'))).toHaveLength(
      0
    );
    // The confirmation modal state is left untouched by the stale response
    expect(screen.getByText('Neue Aufsicht starten?')).toBeInTheDocument();
  });

  it('discards a stale success response after an invalidation (logout) while in flight', async () => {
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

    // A logout elsewhere invalidates the in-flight recreation request
    invalidateLikeLogout();

    // Now the stale request succeeds; the success must be discarded silently
    resolveStart(startResponse);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockNavigate).not.toHaveBeenCalledWith('/nfc-scanning');
    // The confirmation modal state is left untouched by the stale response
    expect(screen.getByText('Neue Aufsicht starten?')).toBeInTheDocument();
  });

  it('discards a stale error when a second recreation attempt superseded the first', async () => {
    // The confirm button is disabled while a request is in flight, so a second
    // UI submit is impossible; the supersede rule is exercised at store level.
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

    // A second store-level recreation attempt supersedes the first request
    const secondOutcome = await useUserStore.getState().recreateSession();
    expect(secondOutcome).toMatchObject({ status: 'success', stale: false });
    expect(mockedApi.startSession).toHaveBeenCalledTimes(2);
    expect(useUserStore.getState().currentSession).toMatchObject({ active_group_id: 99 });

    // The stale first request now fails; no error modal may appear
    rejectFirst(new Error('First request failed late'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(
      screen.queryAllByText(content => content.includes('First request failed late'))
    ).toHaveLength(0);
  });

  it('sends no second request when confirm is clicked again while one is in flight', async () => {
    let resolveStart: (value: typeof startResponse) => void = () => {};
    mockedApi.startSession.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveStart = resolve;
        })
    );

    const user = userEvent.setup();
    renderPage();

    await openRecreationConfirm(user);

    const startButtons = screen.getAllByText('Aufsicht starten');
    const confirmButton = startButtons[startButtons.length - 1].closest('button');
    expect(confirmButton).not.toBeNull();

    await user.click(confirmButton!);
    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
    });

    // The button is disabled and shows the loading label while in flight
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveTextContent('Starte...');
    await user.click(confirmButton!);

    resolveStart(startResponse);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });

    expect(mockedApi.startSession).toHaveBeenCalledTimes(1);
  });

  it('does not repopulate the store from a stale success after an invalidation', async () => {
    const saveLastSessionData = vi.fn(() => Promise.resolve());
    useUserStore.setState({ saveLastSessionData });

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

    // A logout elsewhere invalidates the in-flight recreation request
    invalidateLikeLogout();

    // The stale success must not write session state or persist session data
    resolveStart(startResponse);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(useUserStore.getState().currentSession).toBeNull();
    expect(saveLastSessionData).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Server-deleted activity: entry disappears from the visible history list
  // =========================================================================

  it('removes a server-deleted activity from the history list after failed validation', async () => {
    const deletedEntry = historyEntry; // activity_id 10, no longer on the server
    const validEntry: SessionHistoryEntry = {
      activity_id: 11,
      room_id: 7,
      supervisor_ids: [1],
      saved_at: '2026-03-13T14:00:00Z',
      activity_name: 'Fußball AG',
      room_name: 'Turnhalle',
      supervisor_names: ['Frau Müller'],
    };

    useUserStore.setState({
      sessionSettings: { auto_save_enabled: true, session_history: [deletedEntry, validEntry] },
      validateAndRecreateSession: realValidateAndRecreateSession,
    });
    // Server only knows the valid activity; entry 10 was deleted
    mockedApi.getActivities.mockResolvedValue([
      { id: 11, name: 'Fußball AG', category: 'Betreuung' },
    ] as never);
    mockedApi.getRooms.mockResolvedValue([
      testRoom,
      { id: 7, name: 'Turnhalle', is_occupied: false },
    ] as never);

    const user = userEvent.setup();
    renderPage();

    const deletedRow = await screen.findByText(/Raum A · /);
    await user.click(deletedRow.closest('button')!);

    // Specific German error message is shown
    await waitFor(() => {
      expect(screen.getByText(/nicht mehr verfügbar/)).toBeInTheDocument();
    });

    // Only the invalid entry was removed from the persisted history
    expect(
      useUserStore.getState().sessionSettings?.session_history.map(e => e.activity_id)
    ).toEqual([11]);

    // The list shows the valid entry but not the deleted one
    expect(await screen.findByText(/Turnhalle · /)).toBeInTheDocument();
    expect(screen.queryByText(/Raum A · /)).not.toBeInTheDocument();
  });
});
