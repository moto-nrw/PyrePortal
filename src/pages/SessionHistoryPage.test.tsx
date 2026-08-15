import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

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
      startSession: vi.fn().mockResolvedValue({
        active_group_id: 99,
        activity_id: 10,
        device_id: 1,
        start_time: '2026-03-15T10:00:00Z',
        supervisors: [],
        status: 'started',
        message: 'Activity session started successfully',
      }),
    },
  };
});

const mockedApi = vi.mocked(api);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Reusable authenticated user fixture */
const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

/** Minimal current session fixture */
const activeSession: CurrentSession = {
  active_group_id: 42,
  activity_id: 10,
  activity_name: 'Hausaufgaben',
  room_id: 5,
  room_name: 'Raum A',
  device_id: 1,
  start_time: '2026-03-15T10:00:00Z',
  duration: '01:30:00',
  is_active: true,
  active_students: 12,
};

/** History entry fixture for the saved session combination */
const historyEntry: SessionHistoryEntry = {
  activity_id: 10,
  room_id: 5,
  supervisor_ids: [1, 2],
  saved_at: '2026-03-14T15:00:00Z',
  activity_name: 'Hausaufgaben',
  room_name: 'Raum A',
  supervisor_names: ['Frau Müller', 'Herr Schmidt'],
};

/** Session settings fixture with one saved history entry */
const sessionSettingsWithHistory: SessionSettings = {
  auto_save_enabled: true,
  session_history: [historyEntry],
};

/** Activity fixture matching ActivityResponse shape */
const testActivity = { id: 10, name: 'Hausaufgaben', category: 'Betreuung' };

/** Room fixture matching Room shape */
const testRoom = { id: 5, name: 'Raum A', is_occupied: false };

/** Build a distinct history entry for pagination tests */
function makeEntry(index: number): SessionHistoryEntry {
  return {
    activity_id: 100 + index,
    room_id: 200 + index,
    supervisor_ids: [1],
    saved_at: `2026-03-${String(2 + index).padStart(2, '0')}T10:00:00Z`,
    activity_name: `Aktivität ${index}`,
    room_name: `Raum ${index}`,
    supervisor_names: ['Frau Müller'],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionHistoryPage />
    </MemoryRouter>
  );
}

/** Select the saved combination row */
async function selectHistoryEntry(user: ReturnType<typeof userEvent.setup>) {
  const entryRow = await screen.findByText(/Raum A · /);
  await user.click(entryRow.closest('button')!);
}

/** Select the history entry and wait for the recreation confirmation modal */
async function openRecreationConfirm(user: ReturnType<typeof userEvent.setup>) {
  await selectHistoryEntry(user);
  await waitFor(() => {
    expect(screen.getByText('Neue Aufsicht starten?')).toBeInTheDocument();
  });
}

/** Click the confirm button inside the recreation modal ("Aufsicht starten") */
async function clickModalConfirm(user: ReturnType<typeof userEvent.setup>) {
  const startButtons = screen.getAllByText('Aufsicht starten');
  await user.click(startButtons[startButtons.length - 1]);
}

describe('SessionHistoryPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockClear();
    useUserStore.setState({
      authenticatedUser: baseUser,
      currentSession: null,
      selectedSupervisors: [],
      sessionSettings: sessionSettingsWithHistory,
      isValidatingLastSession: false,
      error: null,
      selectedActivity: null,
      selectedRoom: null,
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      validateAndRecreateSession: vi.fn(() => Promise.resolve({ status: 'error' as const })),
      saveLastSessionData: vi.fn(() => Promise.resolve()),
      removeSessionHistoryEntry: vi.fn(() => Promise.resolve()),
      clearSessionHistory: vi.fn(() => Promise.resolve()),
    });
  });

  // =========================================================================
  // Rendering
  // =========================================================================

  it('shows the page title and the template hint', () => {
    renderPage();
    expect(screen.getByText('Letzte Aufsichten')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Diese Aufsichten sind beendet. Beim Antippen startet eine neue Aufsicht mit der gleichen Auswahl.'
      )
    ).toBeInTheDocument();
  });

  it('shows activity, room, supervisors and last-used time of a saved combination', () => {
    renderPage();
    expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
    expect(screen.getByText(/Raum A · Frau Müller, Herr Schmidt/)).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt: /)).toBeInTheDocument();
  });

  it('shows the empty hint when the history is empty', () => {
    useUserStore.setState({
      sessionSettings: { auto_save_enabled: true, session_history: [] },
    });
    renderPage();
    expect(screen.getByText('Keine Einträge vorhanden.')).toBeInTheDocument();
  });

  it('loads session settings on mount', () => {
    const loadSessionSettings = vi.fn(() => Promise.resolve());
    useUserStore.setState({ loadSessionSettings });
    renderPage();
    expect(loadSessionSettings).toHaveBeenCalledOnce();
  });

  // =========================================================================
  // Redirects
  // =========================================================================

  it('redirects to / when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = renderPage();
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(container.innerHTML).toBe('');
  });

  it('redirects to /home when a session is already running', () => {
    useUserStore.setState({ currentSession: activeSession });
    const { container } = renderPage();
    expect(mockNavigate).toHaveBeenCalledWith('/home');
    expect(container.innerHTML).toBe('');
  });

  it('back button navigates to /home', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Zurück'));
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  // =========================================================================
  // Pagination
  // =========================================================================

  it('paginates the history with four entries per page', async () => {
    const user = userEvent.setup();
    const entries = [0, 1, 2, 3, 4, 5].map(makeEntry);
    useUserStore.setState({
      sessionSettings: { auto_save_enabled: true, session_history: entries },
    });
    renderPage();

    // First page shows the first four entries, the rest is on page two
    expect(screen.getByText('Aktivität 0')).toBeInTheDocument();
    expect(screen.getByText('Aktivität 3')).toBeInTheDocument();
    expect(screen.queryByText('Aktivität 4')).not.toBeInTheDocument();

    await user.click(screen.getByText('Nächste'));
    expect(screen.getByText('Aktivität 4')).toBeInTheDocument();
    expect(screen.getByText('Aktivität 5')).toBeInTheDocument();
    expect(screen.queryByText('Aktivität 0')).not.toBeInTheDocument();
  });

  it('shows no pagination controls when all entries fit on one page', () => {
    renderPage();
    expect(screen.queryByText('Nächste')).not.toBeInTheDocument();
  });

  // =========================================================================
  // Deleting entries
  // =========================================================================

  it('deletes a single history entry', async () => {
    const user = userEvent.setup();
    const removeSessionHistoryEntry = vi.fn(() => Promise.resolve());
    useUserStore.setState({ removeSessionHistoryEntry });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Eintrag löschen' }));

    expect(removeSessionHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: 10 })
    );
  });

  it('clears the whole history only after confirming the modal', async () => {
    const user = userEvent.setup();
    const clearSessionHistory = vi.fn(() => Promise.resolve());
    useUserStore.setState({ clearSessionHistory });
    renderPage();

    await user.click(screen.getByText('Alle löschen'));

    // The modal asks first; nothing is deleted yet
    expect(screen.getByText('Verlauf löschen?')).toBeInTheDocument();
    expect(clearSessionHistory).not.toHaveBeenCalled();

    await user.click(screen.getByText('Ja, löschen'));

    expect(clearSessionHistory).toHaveBeenCalledOnce();
  });

  it('does not clear the history when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const clearSessionHistory = vi.fn(() => Promise.resolve());
    useUserStore.setState({ clearSessionHistory });
    renderPage();

    await user.click(screen.getByText('Alle löschen'));
    expect(screen.getByText('Verlauf löschen?')).toBeInTheDocument();

    const cancelButtons = screen.getAllByText('Abbrechen');
    await user.click(cancelButtons[0]);

    expect(clearSessionHistory).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Selection and validation
  // =========================================================================

  it('selecting an entry triggers validateAndRecreateSession with that entry', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'error' as const }));
    useUserStore.setState({ validateAndRecreateSession: validateMock });
    renderPage();

    await selectHistoryEntry(user);
    await waitFor(() => {
      expect(validateMock).toHaveBeenCalledOnce();
    });
    expect(validateMock).toHaveBeenCalledWith(expect.objectContaining({ activity_id: 10 }));
  });

  it('entries are disabled while a validation is in flight', () => {
    useUserStore.setState({ isValidatingLastSession: true });
    renderPage();
    const entryRow = screen.getByText(/Raum A · /).closest('button');
    expect(entryRow).toBeDisabled();
  });

  it('successful validation shows the confirmation modal with the selection details', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    expect(screen.getByText('Raum:')).toBeInTheDocument();
    expect(screen.getByText('Betreuer:')).toBeInTheDocument();
    expect(screen.getByText('Frau Müller, Herr Schmidt')).toBeInTheDocument();
  });

  it('failed validation shows error modal with store error', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => {
      useUserStore.setState({ error: 'Aktivität nicht gefunden' });
      return Promise.resolve({ status: 'error' as const });
    });
    useUserStore.setState({ validateAndRecreateSession: validateMock });
    renderPage();

    await selectHistoryEntry(user);
    await waitFor(() => {
      expect(screen.getByText('Aktivität nicht gefunden')).toBeInTheDocument();
    });
  });

  it('failed validation shows fallback error when store error is null', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => {
      useUserStore.setState({ error: null });
      return Promise.resolve({ status: 'error' as const });
    });
    useUserStore.setState({ validateAndRecreateSession: validateMock });
    renderPage();

    await selectHistoryEntry(user);
    await waitFor(() => {
      expect(
        screen.getByText(
          'Die gespeicherte Sitzung konnte nicht überprüft werden. Bitte Verbindung prüfen oder Sitzung neu erstellen.'
        )
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Confirmation flow
  // =========================================================================

  it('confirm recreation calls api.startSession and navigates to /nfc-scanning', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    await clickModalConfirm(user);

    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
        activity_id: 10,
        room_id: 5,
        supervisor_ids: [1, 2],
      });
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });
  });

  it('confirm recreation shows error when session data is incomplete', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: null,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    await clickModalConfirm(user);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.'
        )
      ).toBeInTheDocument();
    });
  });

  it('confirm recreation handles api.startSession error', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    mockedApi.startSession.mockRejectedValueOnce(new Error('Server error'));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    await clickModalConfirm(user);

    await waitFor(() => {
      expect(screen.getByText(content => content.includes('Server error'))).toBeInTheDocument();
    });
  });

  it('formatRecreationError handles non-Error objects', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    mockedApi.startSession.mockRejectedValueOnce('string error');
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    await clickModalConfirm(user);

    await waitFor(() => {
      expect(screen.getByText('Fehler beim Starten der Aktivität')).toBeInTheDocument();
    });
  });

  it('confirm modal cancel button closes the modal without starting a session', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    const cancelButtons = screen.getAllByText('Abbrechen');
    await user.click(cancelButtons[0]);

    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });

  it('shows "Starte..." in the confirm modal while validating', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    useUserStore.setState({ isValidatingLastSession: true });

    await waitFor(() => {
      expect(screen.getByText('Starte...')).toBeInTheDocument();
    });
  });

  it('confirms the pending entry even after the history was cleared meanwhile', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    // Clear the stored history before clicking confirm
    useUserStore.setState({
      sessionSettings: { auto_save_enabled: true, session_history: [] },
    });

    await clickModalConfirm(user);

    // The selected entry is already pending, so the start request still goes out
    await waitFor(() => {
      expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
        activity_id: 10,
        room_id: 5,
        supervisor_ids: [1],
      });
    });
  });

  it('does not start a session when the user is logged out before confirming', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve({ status: 'success' as const }));
    useUserStore.setState({
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await openRecreationConfirm(user);
    // Losing authentication blanks the page and redirects to /
    useUserStore.setState({ authenticatedUser: null });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });
});
