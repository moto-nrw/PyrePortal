import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach } from 'vitest';

import { useUserStore } from '../store/userStore';

import ProtectedRoute from './ProtectedRoute';

beforeEach(() => {
  useUserStore.setState({ authenticatedUser: null });
});

function renderWithRouter(ui: React.ReactElement, initialEntries = ['/test']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test',
        deviceName: 'Dev',
        pin: '1234',
        authenticatedAt: new Date(),
      },
    });

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to landing when not authenticated', () => {
    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>Should not see this</div>
      </ProtectedRoute>
    );

    expect(container.textContent).not.toContain('Should not see this');
  });

  it('redirects when condition is false', () => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test',
        deviceName: 'Dev',
        pin: '1234',
        authenticatedAt: new Date(),
      },
    });

    const { container } = renderWithRouter(
      <ProtectedRoute condition={false}>
        <div>Conditional Content</div>
      </ProtectedRoute>
    );

    expect(container.textContent).not.toContain('Conditional Content');
  });

  it('renders when condition is true', () => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test',
        deviceName: 'Dev',
        pin: '1234',
        authenticatedAt: new Date(),
      },
    });

    renderWithRouter(
      <ProtectedRoute condition={true}>
        <div>Allowed</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });
});
