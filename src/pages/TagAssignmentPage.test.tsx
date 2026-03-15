import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import TagAssignmentPage from './TagAssignmentPage';

describe('TagAssignmentPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
    });
  });

  it('renders without crashing when authenticated', () => {
    render(
      <MemoryRouter>
        <TagAssignmentPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter>
        <TagAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Armband identifizieren')).toBeInTheDocument();
  });

  it('shows the scan start button', () => {
    render(
      <MemoryRouter>
        <TagAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Scan starten')).toBeInTheDocument();
  });

  it('shows the instruction text', () => {
    render(
      <MemoryRouter>
        <TagAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Drücken Sie den Knopf/)).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter>
        <TagAssignmentPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });
});
