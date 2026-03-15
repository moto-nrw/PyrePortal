import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import StaffSelectionPage from './StaffSelectionPage';

describe('StaffSelectionPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      selectedActivity: {
        id: 1,
        name: 'Test Activity',
        category: 'Test',
        category_name: 'Test',
        room_name: 'Room 1',
        is_active: false,
        is_occupied: false,
        max_participants: 20,
        enrollment_count: 0,
      },
      users: [],
      selectedSupervisors: [],
      isLoading: false,
      error: null,
    });
  });

  it('renders without crashing with required state', () => {
    render(
      <MemoryRouter>
        <StaffSelectionPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter>
        <StaffSelectionPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Wer ist dabei?')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter>
        <StaffSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no activity selected', () => {
    useUserStore.setState({ selectedActivity: null });
    const { container } = render(
      <MemoryRouter>
        <StaffSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
