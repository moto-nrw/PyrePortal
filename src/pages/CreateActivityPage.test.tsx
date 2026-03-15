import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import CreateActivityPage from './CreateActivityPage';

describe('CreateActivityPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      isLoading: false,
      error: null,
      selectedActivity: null,
    });
  });

  it('renders without crashing when authenticated', () => {
    render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Was machen wir?')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
