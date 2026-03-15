import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useUserStore } from '../store/userStore';

import StaffSelectionPage from './StaffSelectionPage';

// ---------------------------------------------------------------------------
// Mock react-router-dom's useNavigate
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baseAuthUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  authenticatedAt: new Date(),
  pin: '1234',
};

const baseActivity = {
  id: 1,
  name: 'Test Activity',
  category: 'Test',
  category_name: 'Test',
  room_name: 'Room 1',
  is_active: false,
  is_occupied: false,
  max_participants: 20,
  enrollment_count: 0,
};

function makeUser(id: number, name: string) {
  return { id, name };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StaffSelectionPage />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StaffSelectionPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useUserStore.setState({
      authenticatedUser: baseAuthUser,
      selectedActivity: baseActivity,
      users: [],
      selectedSupervisors: [],
      isLoading: false,
      error: null,
    });
  });

  // -----------------------------------------------------------------------
  // Guard redirects
  // -----------------------------------------------------------------------
  describe('guard redirects', () => {
    it('returns null and navigates to / when not authenticated', () => {
      useUserStore.setState({ authenticatedUser: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('returns null and navigates to /activity-selection when no activity selected', () => {
      useUserStore.setState({ selectedActivity: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
    });

    it('returns null when both auth and activity are missing', () => {
      useUserStore.setState({ authenticatedUser: null, selectedActivity: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------
  describe('rendering', () => {
    it('shows the page title', () => {
      renderPage();
      expect(screen.getByText('Wer ist dabei?')).toBeInTheDocument();
    });

    it('calls fetchTeachers on mount', () => {
      const fetchTeachers = vi.fn().mockResolvedValue(undefined);
      useUserStore.setState({ fetchTeachers });
      renderPage();
      expect(fetchTeachers).toHaveBeenCalledTimes(1);
    });

    it('handles fetchTeachers rejection gracefully', () => {
      const fetchTeachers = vi.fn().mockRejectedValue(new Error('Network error'));
      useUserStore.setState({ fetchTeachers });
      // Should not throw
      expect(() => renderPage()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  describe('loading state', () => {
    it('shows spinner when loading', () => {
      useUserStore.setState({ isLoading: true });
      renderPage();
      // LoadingSpinner renders an SVG with animation
      // When loading, children (grid) should not be rendered
      expect(screen.queryByText('Weiter')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  describe('error state', () => {
    it('shows error message when error is set', () => {
      useUserStore.setState({ error: 'Fehler beim Laden der Lehrer' });
      renderPage();
      expect(screen.getByText('Fehler beim Laden der Lehrer')).toBeInTheDocument();
    });

    it('does not show error when error is null', () => {
      useUserStore.setState({ error: null });
      renderPage();
      expect(screen.queryByText('Fehler beim Laden der Lehrer')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Teacher cards rendering
  // -----------------------------------------------------------------------
  describe('teacher cards', () => {
    it('renders teacher names in grid', () => {
      useUserStore.setState({
        users: [makeUser(1, 'Anna Müller'), makeUser(2, 'Bernd Schmidt')],
      });
      renderPage();
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
      expect(screen.getByText('Bernd Schmidt')).toBeInTheDocument();
    });

    it('clicking a teacher card calls toggleSupervisor', () => {
      const toggleSupervisor = vi.fn();
      useUserStore.setState({
        users: [makeUser(1, 'Anna Müller')],
        toggleSupervisor,
      });
      renderPage();
      fireEvent.click(screen.getByText('Anna Müller'));
      expect(toggleSupervisor).toHaveBeenCalledWith(makeUser(1, 'Anna Müller'));
    });

    it('clicking a teacher card a second time still calls toggleSupervisor (frozen order)', () => {
      const toggleSupervisor = vi.fn();
      useUserStore.setState({
        users: [makeUser(1, 'Anna'), makeUser(2, 'Bernd')],
        toggleSupervisor,
      });
      renderPage();

      // First click freezes the sort order
      fireEvent.click(screen.getByText('Anna'));
      expect(toggleSupervisor).toHaveBeenCalledTimes(1);

      // Second click still works with frozen order
      fireEvent.click(screen.getByText('Bernd'));
      expect(toggleSupervisor).toHaveBeenCalledTimes(2);
      expect(toggleSupervisor).toHaveBeenCalledWith(makeUser(2, 'Bernd'));
    });
  });

  // -----------------------------------------------------------------------
  // Sorting: pre-selected at top, then alphabetical with German locale
  // -----------------------------------------------------------------------
  describe('sorting', () => {
    it('sorts pre-selected supervisors to the top', () => {
      useUserStore.setState({
        users: [makeUser(3, 'Charlie'), makeUser(1, 'Anna'), makeUser(2, 'Bernd')],
        selectedSupervisors: [makeUser(2, 'Bernd')],
      });
      renderPage();

      // All buttons that contain teacher names
      const buttons = screen.getAllByRole('button').filter(btn => {
        const text = btn.textContent ?? '';
        return text === 'Anna' || text === 'Bernd' || text === 'Charlie';
      });

      // Bernd (selected) should appear before Anna and Charlie
      expect(buttons[0].textContent).toBe('Bernd');
    });

    it('sorts alphabetically within selected and unselected groups using German locale', () => {
      useUserStore.setState({
        users: [
          makeUser(3, 'Zara'),
          makeUser(1, 'Anna'),
          makeUser(4, 'Ölke'),
          makeUser(2, 'Bernd'),
        ],
        selectedSupervisors: [makeUser(3, 'Zara'), makeUser(4, 'Ölke')],
      });
      renderPage();

      const buttons = screen.getAllByRole('button').filter(btn => {
        const text = btn.textContent ?? '';
        return ['Anna', 'Bernd', 'Zara', 'Ölke'].includes(text);
      });

      // Selected first (Ölke before Zara in German locale), then unselected (Anna before Bernd)
      expect(buttons[0].textContent).toBe('Ölke');
      expect(buttons[1].textContent).toBe('Zara');
      expect(buttons[2].textContent).toBe('Anna');
      expect(buttons[3].textContent).toBe('Bernd');
    });
  });

  // -----------------------------------------------------------------------
  // Frozen sort order
  // -----------------------------------------------------------------------
  describe('frozen sort order', () => {
    it('freezes sort order after first click so items do not reorder', () => {
      const users = [makeUser(1, 'Anna'), makeUser(2, 'Bernd'), makeUser(3, 'Charlie')];
      const toggleSupervisor = vi.fn();

      useUserStore.setState({
        users,
        selectedSupervisors: [],
        toggleSupervisor,
      });

      const { rerender } = render(
        <MemoryRouter>
          <StaffSelectionPage />
        </MemoryRouter>
      );

      // Click Anna → this freezes the sort order
      fireEvent.click(screen.getByText('Anna'));
      expect(toggleSupervisor).toHaveBeenCalledWith(makeUser(1, 'Anna'));

      // Simulate state change: Anna is now selected, which would normally sort her to top
      // But since the order is frozen, positions should not change
      useUserStore.setState({
        selectedSupervisors: [makeUser(1, 'Anna')],
      });

      rerender(
        <MemoryRouter>
          <StaffSelectionPage />
        </MemoryRouter>
      );

      // Order should still be alphabetical (frozen from initial render)
      const buttons = screen.getAllByRole('button').filter(btn => {
        const text = btn.textContent ?? '';
        return ['Anna', 'Bernd', 'Charlie'].includes(text);
      });
      expect(buttons[0].textContent).toBe('Anna');
      expect(buttons[1].textContent).toBe('Bernd');
      expect(buttons[2].textContent).toBe('Charlie');
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  describe('pagination', () => {
    function makeUsers(count: number) {
      return Array.from({ length: count }, (_, i) =>
        makeUser(i + 1, `User ${String(i + 1).padStart(2, '0')}`)
      );
    }

    it('does not show pagination controls when 10 or fewer users', () => {
      useUserStore.setState({ users: makeUsers(10) });
      renderPage();
      expect(screen.queryByText('Nächste')).not.toBeInTheDocument();
      expect(screen.queryByText('Vorherige')).not.toBeInTheDocument();
    });

    it('shows pagination controls when more than 10 users', () => {
      useUserStore.setState({ users: makeUsers(15) });
      renderPage();
      expect(screen.getByText('Nächste')).toBeInTheDocument();
      expect(screen.getByText('Vorherige')).toBeInTheDocument();
      expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
    });

    it('navigates to next page when clicking Nächste', () => {
      useUserStore.setState({ users: makeUsers(15) });
      renderPage();

      fireEvent.click(screen.getByText('Nächste'));
      expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument();
      // Page 2 should show users 11-15
      expect(screen.getByText('User 11')).toBeInTheDocument();
      expect(screen.queryByText('User 01')).not.toBeInTheDocument();
    });

    it('navigates back to previous page when clicking Vorherige', () => {
      useUserStore.setState({ users: makeUsers(15) });
      renderPage();

      fireEvent.click(screen.getByText('Nächste'));
      expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Vorherige'));
      expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
      expect(screen.getByText('User 01')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Continue button
  // -----------------------------------------------------------------------
  describe('continue button', () => {
    it('renders "Weiter" button', () => {
      renderPage();
      expect(screen.getByText('Weiter')).toBeInTheDocument();
    });

    it('disables Weiter when no supervisors selected', () => {
      useUserStore.setState({ selectedSupervisors: [] });
      renderPage();
      const weiterBtn = screen.getByText('Weiter').closest('button');
      expect(weiterBtn).toBeDisabled();
    });

    it('enables Weiter when at least one supervisor is selected', () => {
      useUserStore.setState({ selectedSupervisors: [makeUser(1, 'Anna')] });
      renderPage();
      const weiterBtn = screen.getByText('Weiter').closest('button');
      expect(weiterBtn).not.toBeDisabled();
    });

    it('navigates to /rooms when Weiter is clicked with supervisors selected', () => {
      useUserStore.setState({ selectedSupervisors: [makeUser(1, 'Anna')] });
      renderPage();
      fireEvent.click(screen.getByText('Weiter'));
      expect(mockNavigate).toHaveBeenCalledWith('/rooms');
    });

    it('does not navigate when Weiter is clicked with no supervisors', () => {
      useUserStore.setState({ selectedSupervisors: [] });
      renderPage();
      // The button is disabled, but let's also verify handleContinue guards
      const weiterBtn = screen.getByText('Weiter').closest('button')!;
      fireEvent.click(weiterBtn);
      expect(mockNavigate).not.toHaveBeenCalledWith('/rooms');
    });
  });

  // -----------------------------------------------------------------------
  // Back button
  // -----------------------------------------------------------------------
  describe('back button', () => {
    it('navigates to /activity-selection when back button is clicked', () => {
      renderPage();
      // BackButton renders a button with a back arrow. Find it.
      // The back button is in the top-left corner area
      const backButtons = screen.getAllByRole('button');
      // The back button should be the one that is NOT "Weiter" and not a teacher card
      const backButton = backButtons.find(btn => {
        const text = btn.textContent ?? '';
        return text !== 'Weiter' && !text.includes('Nächste') && !text.includes('Vorherige');
      });
      expect(backButton).toBeDefined();
      fireEvent.click(backButton!);
      expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
    });
  });

  // -----------------------------------------------------------------------
  // isUserSelected highlighting
  // -----------------------------------------------------------------------
  describe('selection highlighting', () => {
    it('marks selected supervisors with visual indicator', () => {
      useUserStore.setState({
        users: [makeUser(1, 'Anna'), makeUser(2, 'Bernd')],
        selectedSupervisors: [makeUser(1, 'Anna')],
      });
      renderPage();

      // Anna's card button should have a green border (selected style)
      const annaBtn = screen.getByText('Anna').closest('button')!;
      expect(annaBtn.style.borderWidth || annaBtn.style.border).toBeDefined();

      // Bernd should not have the selected style
      const berndBtn = screen.getByText('Bernd').closest('button')!;
      // The selected card has 3px solid green border, unselected has 2px solid border
      expect(annaBtn.style.border).toContain('3px');
      expect(berndBtn.style.border).toContain('2px');
    });
  });
});
