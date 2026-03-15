import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import TeamManagementPage from './TeamManagementPage';

describe('TeamManagementPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      users: [],
      selectedSupervisors: [],
      isLoading: false,
      error: null,
      currentSession: null,
    });
  });

  it('renders without crashing when authenticated', () => {
    render(
      <MemoryRouter>
        <TeamManagementPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter>
        <TeamManagementPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Team anpassen')).toBeInTheDocument();
  });

  it('shows the back button', () => {
    render(
      <MemoryRouter>
        <TeamManagementPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Zurück')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter>
        <TeamManagementPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
