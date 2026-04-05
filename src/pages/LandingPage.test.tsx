import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

import { getSchoolName } from '../services/api';
import { logError } from '../utils/logger';

import LandingPage from './LandingPage';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    restartApp: vi.fn(),
  },
}));

// Mock getSchoolName from api service
vi.mock('../services/api', () => ({
  getSchoolName: vi.fn(() => null),
}));
const mockGetSchoolName = vi.mocked(getSchoolName);

const { adapter } = await import('@platform');
const mockRestartApp = vi.mocked(adapter.restartApp);

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

  // --- handleRestart tests ---

  it('calls adapter.restartApp() when restart button is clicked', async () => {
    mockRestartApp.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Neu starten'));

    expect(mockRestartApp).toHaveBeenCalled();
  });

  it('resolves successfully when restartApp succeeds', async () => {
    mockRestartApp.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Neu starten'));

    await vi.waitFor(() => {
      expect(mockRestartApp).toHaveBeenCalled();
    });
  });

  it('calls logError when restartApp rejects with an Error', async () => {
    const restartError = new Error('restart failed');
    mockRestartApp.mockRejectedValueOnce(restartError);

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Neu starten'));

    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(restartError, 'LandingPage.handleRestart');
    });
  });

  it('calls logError with wrapped Error when restartApp rejects with a string', async () => {
    mockRestartApp.mockRejectedValueOnce('string error');

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Neu starten'));

    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'string error' }),
        'LandingPage.handleRestart'
      );
    });
  });

  // --- Pointer event tests (components use onPointerDown/onPointerUp) ---

  it('applies pressed styles on pointerDown of login button', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const button = screen.getByText('Anmelden');
    fireEvent.pointerDown(button);

    expect(button.style.transform).toBe('scale(0.95)');
    expect(button.style.backgroundColor).toBe('#1F2937');
    expect(button.style.boxShadow).toBe('0 2px 8px rgba(0, 0, 0, 0.2)');
  });

  it('fires pointerUp handler without error', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const button = screen.getByText('Anmelden');
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);

    // pointerUp immediately restores styles (no setTimeout)
    expect(button.style.transform).toBe('');
  });

  it('restores original styles on pointerUp', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const button = screen.getByText('Anmelden');
    fireEvent.pointerDown(button);
    expect(button.style.transform).toBe('scale(0.95)');

    fireEvent.pointerUp(button);

    expect(button.style.transform).toBe('');
    expect(button.style.backgroundColor).toBe('#111827');
    expect(button.style.boxShadow).toBe('0 4px 12px rgba(0, 0, 0, 0.15)');
  });

  it('restores original styles on pointerLeave', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const button = screen.getByText('Anmelden');
    fireEvent.pointerDown(button);
    expect(button.style.transform).toBe('scale(0.95)');

    fireEvent.pointerLeave(button);

    expect(button.style.transform).toBe('');
    expect(button.style.backgroundColor).toBe('#111827');
    expect(button.style.boxShadow).toBe('0 4px 12px rgba(0, 0, 0, 0.15)');
  });

  // --- Additional styling tests ---

  it('login button has correct dimensions and font size', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const button = screen.getByText('Anmelden');
    expect(button.style.maxWidth).toBe('360px');
    expect(button.style.height).toBe('90px');
    expect(button.style.fontSize).toBe('28px');
  });

  it('restart button wrapper is positioned fixed top-right', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const restartButton = screen.getByText('Neu starten');
    // The fixed-position wrapper is the parent's parent (BackButton > PillButton > wrapper div)
    // Walk up to find the element with position: fixed
    let wrapper = restartButton.parentElement;
    while (wrapper && wrapper.style.position !== 'fixed') {
      wrapper = wrapper.parentElement;
    }
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.top).toBe('20px');
    expect(wrapper!.style.right).toBe('20px');
    expect(wrapper!.style.zIndex).toBe('50');
  });

  // --- School name display tests ---

  it('displays school name when available', () => {
    mockGetSchoolName.mockReturnValue('OGS Testschule');

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByText('OGS Testschule')).toBeInTheDocument();
  });

  it('does not render school name element when getSchoolName returns null', () => {
    mockGetSchoolName.mockReturnValue(null);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.queryByText('OGS Testschule')).not.toBeInTheDocument();
  });
});
