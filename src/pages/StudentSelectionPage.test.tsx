import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import StudentSelectionPage from './StudentSelectionPage';

const locationState = {
  scannedTag: '04:D6:94:82:97:6A:80',
  tagAssignment: {
    assigned: false,
  },
};

describe('StudentSelectionPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      selectedSupervisors: [],
    });
  });

  it('renders without crashing with location state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Person auswählen')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no scanned tag in state', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection' }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
