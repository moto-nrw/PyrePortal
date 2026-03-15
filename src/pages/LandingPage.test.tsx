import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import LandingPage from './LandingPage';

/**
 * Helper component that reports location changes via callback.
 * Renders nothing — purely for test observation.
 */
function LocationTracker({ onLocationChange }: { onLocationChange: (path: string) => void }) {
  const location = useLocation();
  useEffect(() => {
    onLocationChange(location.pathname);
  }, [location.pathname, onLocationChange]);
  return null;
}

describe('LandingPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
  });

  it('shows the welcome heading', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Willkommen bei moto!')).toBeInTheDocument();
  });

  it('shows the login button', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Anmelden')).toBeInTheDocument();
  });

  it('shows the restart button', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Neu starten')).toBeInTheDocument();
  });

  it('renders the moto logo', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByAltText('Moto logo')).toBeInTheDocument();
  });

  it('renders the moto logo with correct image source', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const logo = screen.getByAltText('Moto logo');
    expect(logo).toHaveAttribute('src', '/img/moto_transparent.png');
  });

  it('displays branding text with "moto" in the welcome heading', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const heading = screen.getByText('Willkommen bei moto!');
    expect(heading.tagName).toBe('H1');
  });

  it('login button is a button element with correct type', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const button = screen.getByText('Anmelden');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('navigates to /pin when Anmelden button is clicked', async () => {
    let currentPath = '/';
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
        <LocationTracker
          onLocationChange={path => {
            currentPath = path;
          }}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Anmelden'));

    // After clicking, navigate('/pin') is called — MemoryRouter updates the location
    expect(currentPath).toBe('/pin');
  });

  it('restart button has correct label text', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const restartButton = screen.getByText('Neu starten');
    expect(restartButton).toBeInTheDocument();
  });

  it('login button has correct visual styling', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const button = screen.getByText('Anmelden');
    expect(button.style.backgroundColor).toBe('#111827');
    expect(button.style.color).toBe('#FFFFFF');
  });

  it('renders the welcome heading with gradient styling', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const heading = screen.getByText('Willkommen bei moto!');
    // The heading should have the gradient class
    expect(heading.className).toContain('bg-gradient-to-r');
    expect(heading.className).toContain('bg-clip-text');
  });
});
