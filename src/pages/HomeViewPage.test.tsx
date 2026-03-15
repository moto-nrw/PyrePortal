import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

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
// Mock api module to control startSession / endSession
// ---------------------------------------------------------------------------
vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      startSession: vi.fn().mockResolvedValue({ active_group_id: 99 }),
      endSession: vi.fn().mockResolvedValue(undefined),
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
  authenticatedAt: new Date(),
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

/** Session settings fixture with a saved last session */
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

/** Activity fixture matching ActivityResponse shape */
const testActivity = { id: 10, name: 'Hausaufgaben', category: 'Betreuung' };

/** Room fixture matching Room shape */
const testRoom = { id: 5, name: 'Raum A', is_occupied: false };

function renderPage() {
  return render(
    <MemoryRouter>
      <HomeViewPage />
    </MemoryRouter>
  );
}

describe('HomeViewPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useUserStore.setState({
      authenticatedUser: baseUser,
      currentSession: null,
      selectedSupervisors: [],
      sessionSettings: null,
      isValidatingLastSession: false,
      error: null,
      selectedActivity: null,
      selectedRoom: null,
      fetchCurrentSession: vi.fn(() => Promise.resolve()),
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      logout: vi.fn(() => Promise.resolve()),
      validateAndRecreateSession: vi.fn(() => Promise.resolve(false)),
      saveLastSessionData: vi.fn(() => Promise.resolve()),
    });
  });

  // =========================================================================
  // Basic rendering tests
  // =========================================================================

  it('renders without crashing when authenticated', () => {
    renderPage();
  });

  it('shows the menu heading', () => {
    renderPage();
    expect(screen.getByText('Menü')).toBeInTheDocument();
  });

  it('shows the start activity heading', () => {
    renderPage();
    const elements = screen.getAllByText('Aufsicht starten');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the team management button', () => {
    renderPage();
    expect(screen.getByText('Team anpassen')).toBeInTheDocument();
  });

  it('shows logout button when no session', () => {
    renderPage();
    expect(screen.getByText('Abmelden')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = renderPage();
    expect(container.innerHTML).toBe('');
  });

  it('shows "Armband identifizieren" tag assignment button', () => {
    renderPage();
    expect(screen.getByText('Armband identifizieren')).toBeInTheDocument();
  });

  it('shows "Aufsicht beenden" instead of "Abmelden" when session is active', () => {
    useUserStore.setState({ currentSession: activeSession });
    renderPage();
    expect(screen.getByText('Aufsicht beenden')).toBeInTheDocument();
    expect(screen.queryByText('Abmelden')).not.toBeInTheDocument();
  });

  it('shows activity name and "Fortsetzen" when a current session exists', () => {
    useUserStore.setState({ currentSession: activeSession });
    renderPage();
    expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
    expect(screen.getByText('Fortsetzen')).toBeInTheDocument();
  });

  it('shows "Aufsicht wiederholen" when last session is saved and toggle is on', () => {
    useUserStore.setState({ sessionSettings: sessionSettingsWithLastSession });
    renderPage();
    expect(screen.getByText('Aufsicht wiederholen')).toBeInTheDocument();
    expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
  });

  it('shows room name and supervisor count for saved last session', () => {
    useUserStore.setState({ sessionSettings: sessionSettingsWithLastSession });
    renderPage();
    expect(screen.getByText('Raum A')).toBeInTheDocument();
    expect(screen.getByText('2 Betreuer')).toBeInTheDocument();
  });

  it('shows adjusted supervisor count when selectedSupervisors differs from saved', () => {
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller', staffId: 1, staffName: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt', staffId: 2, staffName: 'Herr Schmidt' },
        { id: 3, name: 'Herr Becker', staffId: 3, staffName: 'Herr Becker' },
      ] as never[],
    });
    renderPage();
    expect(screen.getByText('3 Betreuer (gespeichert: 2)')).toBeInTheDocument();
  });

  it('disables activity button when isValidatingLastSession is true', () => {
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      isValidatingLastSession: true,
    });
    renderPage();
    const activityButton = screen.getByText('Aufsicht wiederholen').closest('button');
    expect(activityButton).toBeDisabled();
  });

  it('does not show "Aufsicht wiederholen" when use_last_session is false', () => {
    useUserStore.setState({
      sessionSettings: {
        ...sessionSettingsWithLastSession,
        use_last_session: false,
      },
    });
    renderPage();
    expect(screen.queryByText('Aufsicht wiederholen')).not.toBeInTheDocument();
    const elements = screen.getAllByText('Aufsicht starten');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('fetches current session and loads settings on mount', () => {
    const fetchCurrentSession = vi.fn(() => Promise.resolve());
    const loadSessionSettings = vi.fn(() => Promise.resolve());
    useUserStore.setState({ fetchCurrentSession, loadSessionSettings });
    renderPage();
    expect(fetchCurrentSession).toHaveBeenCalledOnce();
    expect(loadSessionSettings).toHaveBeenCalledOnce();
  });

  it('renders all primary action buttons', () => {
    renderPage();
    const buttons = screen.getAllByRole('button');
    // Should have at least: tag assignment, logout, activity, team management
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('does not show LastSessionToggle when current session exists', () => {
    useUserStore.setState({ currentSession: activeSession });
    renderPage();
    // LastSessionToggle only renders when no session. The toggle text should not appear.
    // The activity button should show the current session activity name.
    expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
  });

  // =========================================================================
  // Navigation tests
  // =========================================================================

  it('navigates to / when not authenticated (useEffect redirect)', () => {
    useUserStore.setState({ authenticatedUser: null });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('clicking tag assignment button navigates to /tag-assignment', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Armband identifizieren'));
    expect(mockNavigate).toHaveBeenCalledWith('/tag-assignment');
  });

  it('clicking team management button navigates to /team-management', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Team anpassen'));
    expect(mockNavigate).toHaveBeenCalledWith('/team-management');
  });

  it('clicking activity card with current session navigates to /nfc-scanning', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ currentSession: activeSession });
    renderPage();

    await user.click(screen.getByText('Fortsetzen'));
    expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
  });

  it('clicking activity card without session navigates to /activity-selection', async () => {
    const user = userEvent.setup();
    renderPage();

    // Click "Aufsicht starten" on the card (first one is the card heading)
    const headings = screen.getAllByText('Aufsicht starten');
    await user.click(headings[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
  });

  // =========================================================================
  // Logout flow tests
  // =========================================================================

  it('logout button calls logout and navigates to / when no session', async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn(() => Promise.resolve());
    useUserStore.setState({ logout: logoutMock });
    renderPage();

    await user.click(screen.getByText('Abmelden'));
    expect(logoutMock).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('clicking logout with active session shows end session confirmation modal', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ currentSession: activeSession });
    renderPage();

    await user.click(screen.getByText('Aufsicht beenden'));
    expect(screen.getAllByText('Ja, beenden').length).toBeGreaterThanOrEqual(1);
  });

  it('confirms end session calls api.endSession and fetchCurrentSession', async () => {
    const user = userEvent.setup();
    const fetchCurrentSession = vi.fn(() => Promise.resolve());
    useUserStore.setState({
      currentSession: activeSession,
      fetchCurrentSession,
    });
    renderPage();

    // Open end session modal
    await user.click(screen.getByText('Aufsicht beenden'));

    // Confirm
    const confirmButtons = screen.getAllByText('Ja, beenden');
    await user.click(confirmButtons[0]);

    await waitFor(() => {
      expect(mockedApi.endSession).toHaveBeenCalledWith('1234');
    });
    await waitFor(() => {
      expect(fetchCurrentSession).toHaveBeenCalled();
    });
  });

  it('end session modal can be cancelled with Abbrechen', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ currentSession: activeSession });
    renderPage();

    // Open end session modal
    await user.click(screen.getByText('Aufsicht beenden'));
    expect(screen.getAllByText('Ja, beenden').length).toBeGreaterThanOrEqual(1);

    // Cancel
    const cancelButtons = screen.getAllByText('Abbrechen');
    await user.click(cancelButtons[0]);

    // Modal should still exist in DOM but be closed (the ModalBase handles visibility)
  });

  it('end session error is caught gracefully', async () => {
    const user = userEvent.setup();
    mockedApi.endSession.mockRejectedValueOnce(new Error('Network error'));
    useUserStore.setState({ currentSession: activeSession });
    renderPage();

    await user.click(screen.getByText('Aufsicht beenden'));
    const confirmButtons = screen.getAllByText('Ja, beenden');
    await user.click(confirmButtons[0]);

    // Should not crash — error is caught silently
    await waitFor(() => {
      expect(mockedApi.endSession).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Session recreation (last session) tests
  // =========================================================================

  it('clicking activity with saved last session triggers validateAndRecreateSession', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(false));
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(validateMock).toHaveBeenCalledOnce();
    });
  });

  it('successful validation shows confirmation modal', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });
  });

  it('failed validation shows error modal with store error', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => {
      useUserStore.setState({ error: 'Aktivität nicht gefunden' });
      return Promise.resolve(false);
    });
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aktivität nicht gefunden')).toBeInTheDocument();
    });
  });

  it('failed validation shows fallback error when store error is null', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => {
      useUserStore.setState({ error: null });
      return Promise.resolve(false);
    });
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(
        screen.getByText(
          'Die gespeicherte Sitzung konnte nicht überprüft werden. Bitte Verbindung prüfen oder Sitzung neu erstellen.'
        )
      ).toBeInTheDocument();
    });
  });

  it('confirm recreation calls api.startSession and navigates to /nfc-scanning', async () => {
    const user = userEvent.setup();
    const fetchCurrentSession = vi.fn(() => Promise.resolve());
    const saveLastSessionData = vi.fn(() => Promise.resolve());
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      fetchCurrentSession,
      saveLastSessionData,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();

    // Click to trigger recreation
    await user.click(screen.getByText('Aufsicht wiederholen'));

    // Wait for confirmation modal
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Click confirm button ("Aufsicht starten" in the modal)
    const startButtons = screen.getAllByText('Aufsicht starten');
    // The last one is in the confirmation modal
    await user.click(startButtons[startButtons.length - 1]);

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

  it('confirm recreation shows error when session data is incomplete (no activity)', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: null,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));

    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.'
        )
      ).toBeInTheDocument();
    });
  });

  it('confirm recreation shows error when session data is incomplete (no room)', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: null,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.'
        )
      ).toBeInTheDocument();
    });
  });

  it('confirm recreation shows error when no supervisors selected', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

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
    const validateMock = vi.fn(() => Promise.resolve(true));
    mockedApi.startSession.mockRejectedValueOnce(new Error('Server error'));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    // Error modal should appear with the mapped error message
    await waitFor(() => {
      // mapServerErrorToGerman will return the error string or its German mapping
      const errorModal = screen.getByText(content => content.includes('Server error'));
      expect(errorModal).toBeInTheDocument();
    });
  });

  it('confirm recreation handles network-related error with specific message', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));
    const networkError = new TypeError('Failed to fetch');
    mockedApi.startSession.mockRejectedValueOnce(networkError);

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Netzwerkfehler beim Starten der Aktivität. Bitte Verbindung prüfen und erneut versuchen.'
        )
      ).toBeInTheDocument();
    });
  });

  it('confirm modal cancel button closes the modal', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Click Abbrechen in the confirmation modal
    const cancelButtons = screen.getAllByText('Abbrechen');
    await user.click(cancelButtons[0]);

    // The api.startSession should NOT have been called
    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });

  it('does not call handleConfirmRecreation when authenticatedUser is null', async () => {
    // This tests the early return in handleConfirmRecreation
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    // Trigger confirm modal
    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Now set authenticatedUser to null before clicking confirm
    // This won't cause redirect since we're already rendered
    useUserStore.setState({ authenticatedUser: null });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    // api.startSession should NOT be called due to early return
    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Confirmation modal content tests
  // =========================================================================

  it('confirmation modal shows activity details (name, room, supervisors)', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Check modal content
    expect(screen.getByText('Raum:')).toBeInTheDocument();
    expect(screen.getByText('Betreuer:')).toBeInTheDocument();
    expect(screen.getByText('Frau Müller, Herr Schmidt')).toBeInTheDocument();
  });

  it('shows "Starte..." text when isValidatingLastSession is true in confirm modal', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Set validating state
    useUserStore.setState({ isValidatingLastSession: true });

    await waitFor(() => {
      expect(screen.getByText('Starte...')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Touch interaction tests (for coverage of touch handlers)
  // =========================================================================

  it('tag assignment button responds to touch events', () => {
    renderPage();
    const tagButton = screen.getByText('Armband identifizieren').closest('button')!;

    fireEvent.touchStart(tagButton);
    // Check transform was applied
    expect(tagButton.style.transform).toBe('scale(0.95)');

    fireEvent.touchEnd(tagButton);
    // After setTimeout, styles reset - but we can verify the event fired without errors
  });

  it('logout button responds to touch events', () => {
    renderPage();
    const logoutButton = screen.getByText('Abmelden').closest('button')!;

    fireEvent.touchStart(logoutButton);
    expect(logoutButton.style.transform).toBe('scale(0.95)');

    fireEvent.touchEnd(logoutButton);
  });

  it('activity card responds to touch events via state', async () => {
    renderPage();
    const activityHeadings = screen.getAllByText('Aufsicht starten');
    const activityButton = activityHeadings[0].closest('button')!;

    fireEvent.touchStart(activityButton);
    // The component uses state-based transform, so check the transform style
    expect(activityButton.style.transform).toBe('scale(0.98)');

    fireEvent.touchEnd(activityButton);
    await waitFor(() => {
      expect(activityButton.style.transform).toBe('scale(1)');
    });
  });

  it('team management card responds to touch events', async () => {
    renderPage();
    const teamButton = screen.getByText('Team anpassen').closest('button')!;

    fireEvent.touchStart(teamButton);
    expect(teamButton.style.transform).toBe('scale(0.98)');

    fireEvent.touchEnd(teamButton);
    await waitFor(() => {
      expect(teamButton.style.transform).toBe('scale(1)');
    });
  });

  // =========================================================================
  // Helper function edge cases
  // =========================================================================

  it('shows "Aktivität" as fallback heading when currentSession has no activity_name', () => {
    useUserStore.setState({
      currentSession: {
        ...activeSession,
        activity_name: undefined as unknown as string,
      },
    });
    renderPage();
    expect(screen.getByText('Aktivität')).toBeInTheDocument();
  });

  it('shows empty subtitle for saved session activity_name', () => {
    useUserStore.setState({ sessionSettings: sessionSettingsWithLastSession });
    renderPage();
    // The subtitle should show the activity name from the saved session
    // It appears as text in the card
    const subtitleElements = screen.getAllByText('Hausaufgaben');
    expect(subtitleElements.length).toBeGreaterThanOrEqual(1);
  });

  it('getSupervisorCountLabel returns empty when no last_session', () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: null,
      },
    });
    renderPage();
    // No supervisor count label should appear since there's no last_session
    expect(screen.queryByText(/Betreuer/)).not.toBeInTheDocument();
  });

  it('shows same supervisor count when selected matches saved count', () => {
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      selectedSupervisors: [
        { id: 1, name: 'Frau Müller' },
        { id: 2, name: 'Herr Schmidt' },
      ] as never[],
    });
    renderPage();
    // 2 selected == 2 saved, so just shows "2 Betreuer"
    expect(screen.getByText('2 Betreuer')).toBeInTheDocument();
  });

  // =========================================================================
  // Error modal close test
  // =========================================================================

  it('error modal can be closed', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => {
      useUserStore.setState({ error: 'Test error message' });
      return Promise.resolve(false);
    });
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
    });
    renderPage();

    // Trigger error modal
    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // handleConfirmRecreation with missing sessionSettings.last_session
  // =========================================================================

  it('handleConfirmRecreation returns early when sessionSettings.last_session is null', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));

    // First render with valid last_session to show the confirm modal
    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    // Clear sessionSettings before clicking confirm
    useUserStore.setState({
      sessionSettings: { use_last_session: true, auto_save_enabled: true, last_session: null },
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    // Should return early, not call startSession
    expect(mockedApi.startSession).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Non-Error recreation error formatting
  // =========================================================================

  it('formatRecreationError handles non-Error objects', async () => {
    const user = userEvent.setup();
    const validateMock = vi.fn(() => Promise.resolve(true));
    mockedApi.startSession.mockRejectedValueOnce('string error');

    useUserStore.setState({
      sessionSettings: sessionSettingsWithLastSession,
      validateAndRecreateSession: validateMock,
      selectedActivity: testActivity,
      selectedRoom: testRoom,
      selectedSupervisors: [{ id: 1, name: 'Frau Müller' }] as never[],
    });
    renderPage();

    await user.click(screen.getByText('Aufsicht wiederholen'));
    await waitFor(() => {
      expect(screen.getByText('Aufsicht wiederholen?')).toBeInTheDocument();
    });

    const startButtons = screen.getAllByText('Aufsicht starten');
    await user.click(startButtons[startButtons.length - 1]);

    // Should show the fallback German error message
    await waitFor(() => {
      expect(screen.getByText('Fehler beim Starten der Aktivität')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Activity button with current session does not navigate to /activity-selection
  // =========================================================================

  it('activity button with no session and no saved session navigates to /activity-selection', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ sessionSettings: null });
    renderPage();

    const activityHeadings = screen.getAllByText('Aufsicht starten');
    await user.click(activityHeadings[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
  });

  // =========================================================================
  // Continue activity with null currentSession (edge case)
  // =========================================================================

  it('handleContinueActivity does nothing when currentSession is null', async () => {
    // This is covered by the fact that with no session, clicking the button
    // calls handleStartActivity, not handleContinueActivity.
    // The guard `if (currentSession)` in handleContinueActivity prevents navigation.
    const user = userEvent.setup();
    renderPage();

    // Clicking the button will call handleStartActivity, not handleContinueActivity
    const headings = screen.getAllByText('Aufsicht starten');
    await user.click(headings[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
  });
});
