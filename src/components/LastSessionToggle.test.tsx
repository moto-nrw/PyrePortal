import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useUserStore } from '../store/userStore';

import { LastSessionToggle } from './LastSessionToggle';

beforeEach(() => {
  useUserStore.setState({
    sessionSettings: null,
    toggleUseLastSession: vi.fn(),
  });
});

const lastSession = {
  staff_ids: [1],
  room_id: 1,
  room_name: 'Room',
  activity_id: 1,
  activity_name: 'Activity',
  supervisor_ids: [1],
  saved_at: '2026-01-01T00:00:00Z',
  supervisor_names: ['Test'],
};

describe('LastSessionToggle', () => {
  it('returns null when sessionSettings is null', () => {
    const { container } = render(<LastSessionToggle />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toggle label text when sessionSettings exists', () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: false,
        auto_save_enabled: true,
        last_session: null,
      },
    });
    render(<LastSessionToggle />);
    expect(screen.getByText('Letzte Aufsicht wiederholen')).toBeInTheDocument();
  });

  it('renders disabled checkbox when no last session', () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: false,
        auto_save_enabled: true,
        last_session: null,
      },
    });
    render(<LastSessionToggle />);
    const checkbox = screen.getByRole('checkbox', { hidden: true });
    expect(checkbox).toBeDisabled();
  });

  it('renders enabled checkbox when last session exists', () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: false,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });
    render(<LastSessionToggle />);
    const checkbox = screen.getByRole('checkbox', { hidden: true });
    expect(checkbox).not.toBeDisabled();
  });

  it('calls toggleUseLastSession when toggled on', async () => {
    const mockToggle = vi.fn().mockResolvedValue(undefined);
    useUserStore.setState({
      sessionSettings: {
        use_last_session: false,
        auto_save_enabled: true,
        last_session: lastSession,
      },
      toggleUseLastSession: mockToggle,
    });

    render(<LastSessionToggle />);
    await userEvent.click(screen.getByText('Letzte Aufsicht wiederholen'));
    expect(mockToggle).toHaveBeenCalledWith(true);
  });

  it('reflects checked state from sessionSettings', () => {
    useUserStore.setState({
      sessionSettings: {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: lastSession,
      },
    });
    render(<LastSessionToggle />);
    const checkbox: HTMLInputElement = screen.getByRole('checkbox', {
      hidden: true,
    });
    expect(checkbox.checked).toBe(true);
  });
});
