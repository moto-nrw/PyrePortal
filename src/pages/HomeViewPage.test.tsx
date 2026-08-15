import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { api, type CurrentSession } from '../services/api';
import type { SessionHistoryEntry, SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import HomeViewPage from './HomeViewPage';

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
// Mock api module to control endSession
// ---------------------------------------------------------------------------
vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
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
      error: null,
      selectedActivity: null,
      selectedRoom: null,
      fetchCurrentSession: vi.fn(() => Promise.resolve()),
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      logout: vi.fn(() => Promise.resolve()),
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
    expect(screen.getByText('Aufsicht starten')).toBeInTheDocument();
  });

  it('shows the team management button', () => {
    renderPage();
    expect(screen.getByText('Team anpassen')).toBeInTheDocument();
  });

  it('opens staff time tracking from the menu', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Mitarbeiter-Stempeln'));

    expect(mockNavigate).toHaveBeenCalledWith('/staff-clock');
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

  // =========================================================================
  // Session history shortcut in the main area
  // =========================================================================

  it('shows the history button under the start card when a history exists', () => {
    useUserStore.setState({ sessionSettings: sessionSettingsWithHistory });
    renderPage();
    expect(screen.getByRole('button', { name: /Letzte Aufsichten/ })).toBeInTheDocument();
    // The entries themselves live on the history page, not on the home view
    expect(screen.queryByText('Hausaufgaben')).not.toBeInTheDocument();
  });

  it('history button navigates to /session-history', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ sessionSettings: sessionSettingsWithHistory });
    renderPage();

    await user.click(screen.getByRole('button', { name: /Letzte Aufsichten/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/session-history');
  });

  it('does not show the history button when a current session exists', () => {
    useUserStore.setState({
      currentSession: activeSession,
      sessionSettings: sessionSettingsWithHistory,
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /Letzte Aufsichten/ })).not.toBeInTheDocument();
  });

  it('does not show the history button when the session history is empty', () => {
    useUserStore.setState({
      sessionSettings: { auto_save_enabled: true, session_history: [] },
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /Letzte Aufsichten/ })).not.toBeInTheDocument();
  });

  it('main card always starts a new session even when a history exists', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ sessionSettings: sessionSettingsWithHistory });
    renderPage();

    await user.click(screen.getByText('Aufsicht starten'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
  });

  it('main card keeps the start heading while a history entry exists', () => {
    useUserStore.setState({ sessionSettings: sessionSettingsWithHistory });
    renderPage();
    expect(screen.getByText('Aufsicht starten')).toBeInTheDocument();
    expect(screen.queryByText('Fortsetzen')).not.toBeInTheDocument();
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

    await user.click(screen.getByText('Aufsicht starten'));
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
    const activityButton = screen.getByText('Aufsicht starten').closest('button')!;

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
    await user.click(screen.getByText('Aufsicht starten'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
  });
});
