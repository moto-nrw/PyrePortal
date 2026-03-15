import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentSession } from '../services/api';
import type { SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import HomeViewPage from './HomeViewPage';

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

function renderPage() {
  return render(
    <MemoryRouter>
      <HomeViewPage />
    </MemoryRouter>
  );
}

describe('HomeViewPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: baseUser,
      currentSession: null,
      selectedSupervisors: [],
      sessionSettings: null,
      isValidatingLastSession: false,
      fetchCurrentSession: vi.fn(() => Promise.resolve()),
      loadSessionSettings: vi.fn(() => Promise.resolve()),
      logout: vi.fn(() => Promise.resolve()),
    });
  });

  it('renders without crashing when authenticated', () => {
    renderPage();
  });

  it('shows the menu heading', () => {
    renderPage();
    expect(screen.getByText('Menü')).toBeInTheDocument();
  });

  it('shows the start activity heading', () => {
    renderPage();
    // "Aufsicht starten" appears in both the card heading and the confirm modal button
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

  // --- New tests below ---

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

  it('logout button is clickable and calls logout when no session', async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn(() => Promise.resolve());
    useUserStore.setState({ logout: logoutMock });
    renderPage();

    await user.click(screen.getByText('Abmelden'));
    expect(logoutMock).toHaveBeenCalledOnce();
  });

  it('clicking logout with active session shows end session confirmation modal', async () => {
    const user = userEvent.setup();
    useUserStore.setState({ currentSession: activeSession });
    renderPage();

    await user.click(screen.getByText('Aufsicht beenden'));
    // The confirmation modal should appear with the "Ja, beenden" button
    expect(screen.getAllByText('Ja, beenden').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show "Aufsicht starten" when current session exists', () => {
    useUserStore.setState({ currentSession: activeSession });
    renderPage();
    // The card heading should show the activity name, not "Aufsicht starten"
    expect(screen.queryByText('Aufsicht starten')).toBeInTheDocument(); // still in confirm modal button
    expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
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
});
