import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import HomeViewPage from './HomeViewPage';

describe('HomeViewPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      currentSession: null,
      selectedSupervisors: [],
      sessionSettings: null,
      isValidatingLastSession: false,
    });
  });

  it('renders without crashing when authenticated', () => {
    render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
  });

  it('shows the menu heading', () => {
    render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Menü')).toBeInTheDocument();
  });

  it('shows the start activity heading', () => {
    render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
    // "Aufsicht starten" appears in both the card heading and the confirm modal button
    const elements = screen.getAllByText('Aufsicht starten');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the team management button', () => {
    render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Team anpassen')).toBeInTheDocument();
  });

  it('shows logout button when no session', () => {
    render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Abmelden')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter>
        <HomeViewPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
