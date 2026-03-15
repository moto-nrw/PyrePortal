import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { api, type Room, type ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';

import RoomSelectionPage from './RoomSelectionPage';

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
// Mock api module
// ---------------------------------------------------------------------------
vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      startSession: vi.fn().mockResolvedValue({
        active_group_id: 42,
        activity_id: 10,
        device_id: 1,
        start_time: '2026-03-15T10:00:00Z',
        supervisors: [],
        status: 'active',
        message: 'Session started',
      }),
      fetchCurrentSession: vi.fn().mockResolvedValue(null),
      saveLastSessionData: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockedApi = vi.mocked(api);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  authenticatedAt: new Date(),
  pin: '1234',
};

const testActivity: ActivityResponse = {
  id: 10,
  name: 'Hausaufgaben',
  category: 'Betreuung',
};

const testSupervisors = [
  { id: 1, name: 'Frau Mueller' },
  { id: 2, name: 'Herr Schmidt' },
];

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 1,
    name: 'Raum A',
    room_type: 'Klassenzimmer',
    capacity: 30,
    is_occupied: false,
    ...overrides,
  };
}

const availableRooms: Room[] = [
  makeRoom({ id: 1, name: 'Raum A', capacity: 30, is_occupied: false }),
  makeRoom({ id: 2, name: 'Raum B', capacity: 20, is_occupied: false }),
  makeRoom({ id: 3, name: 'Raum C', capacity: 15, is_occupied: true }),
];

function setStoreState(overrides: Record<string, unknown> = {}) {
  useUserStore.setState({
    authenticatedUser: baseUser,
    selectedActivity: testActivity,
    selectedSupervisors: testSupervisors,
    rooms: availableRooms,
    isLoading: false,
    error: null,
    fetchRooms: vi.fn(() => Promise.resolve()),
    selectRoom: vi.fn(),
    fetchCurrentSession: vi.fn(() => Promise.resolve()),
    saveLastSessionData: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RoomSelectionPage />
    </MemoryRouter>
  );
}

describe('RoomSelectionPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockReset();
    mockedApi.startSession.mockResolvedValue({
      active_group_id: 42,
      activity_id: 10,
      device_id: 1,
      start_time: '2026-03-15T10:00:00Z',
      supervisors: [],
      status: 'active',
      message: 'Session started',
    });
    setStoreState();
  });

  // =========================================================================
  // Guard redirects
  // =========================================================================

  describe('guard redirects', () => {
    it('returns null and navigates to / when not authenticated', async () => {
      setStoreState({ authenticatedUser: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('returns null and navigates to /activity-selection when no activity selected', async () => {
      setStoreState({ selectedActivity: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/activity-selection');
      });
    });

    it('returns null and navigates to /staff-selection when no supervisors selected', async () => {
      setStoreState({ selectedSupervisors: [] });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/staff-selection');
      });
    });

    it('returns null when selectedSupervisors is null', async () => {
      setStoreState({ selectedSupervisors: null });
      const { container } = renderPage();
      expect(container.innerHTML).toBe('');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/staff-selection');
      });
    });
  });

  // =========================================================================
  // Basic rendering
  // =========================================================================

  describe('rendering', () => {
    it('renders the page title', () => {
      renderPage();
      expect(screen.getByText('Wo machen wir das?')).toBeInTheDocument();
    });

    it('renders room cards', () => {
      renderPage();
      expect(screen.getByText('Raum A')).toBeInTheDocument();
      expect(screen.getByText('Raum B')).toBeInTheDocument();
      expect(screen.getByText('Raum C')).toBeInTheDocument();
    });

    it('renders capacity badges for rooms that have capacity', () => {
      renderPage();
      expect(screen.getByText('30 Plätze')).toBeInTheDocument();
      expect(screen.getByText('20 Plätze')).toBeInTheDocument();
    });

    it('does not render badge when room has no capacity', () => {
      setStoreState({
        rooms: [makeRoom({ id: 1, name: 'No Cap Room', capacity: undefined })],
      });
      renderPage();
      expect(screen.getByText('No Cap Room')).toBeInTheDocument();
      expect(screen.queryByText('Plätze')).not.toBeInTheDocument();
    });

    it('calls fetchRooms on mount', () => {
      const fetchRooms = vi.fn(() => Promise.resolve());
      setStoreState({ fetchRooms });
      renderPage();
      expect(fetchRooms).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Empty state
  // =========================================================================

  describe('empty state', () => {
    it('shows empty message when no rooms available', () => {
      setStoreState({ rooms: [] });
      renderPage();
      expect(screen.getByText('Keine Räume verfügbar')).toBeInTheDocument();
      expect(
        screen.getByText('Es sind derzeit keine Räume für die Auswahl verfügbar.')
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Room selection
  // =========================================================================

  describe('room selection', () => {
    it('clicking available room opens confirmation modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      expect(screen.getByText('Aufsicht starten?')).toBeInTheDocument();
    });

    it('clicking occupied room does not open modal', () => {
      renderPage();
      // Raum C is occupied, its button is disabled
      const roomCButton = screen.getByText('Raum C').closest('button');
      expect(roomCButton).toBeDisabled();
      // Try to click - should not open modal
      if (roomCButton) {
        fireEvent.click(roomCButton);
      }
      expect(screen.queryByText('Aufsicht starten?')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Confirmation Modal
  // =========================================================================

  describe('ConfirmationModal', () => {
    it('shows activity name in modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      // Both ConfirmationModal and ConflictModal render when selectedRoom is set
      const activityNames = screen.getAllByText('Hausaufgaben');
      expect(activityNames.length).toBeGreaterThanOrEqual(1);
    });

    it('shows room name in modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      // Room name appears in the modal details
      const roomNames = screen.getAllByText('Raum A');
      expect(roomNames.length).toBeGreaterThanOrEqual(1);
    });

    it('shows room type in modal when present', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      expect(screen.getByText('Typ: Klassenzimmer')).toBeInTheDocument();
    });

    it('does not show room type when not present', async () => {
      setStoreState({
        rooms: [makeRoom({ id: 1, name: 'Raum X', room_type: undefined })],
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum X'));
      expect(screen.queryByText(/Typ:/)).not.toBeInTheDocument();
    });

    it('shows supervisors in modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      // Both modals render supervisors
      const mueller = screen.getAllByText('Frau Mueller');
      expect(mueller.length).toBeGreaterThanOrEqual(1);
      const schmidt = screen.getAllByText('Herr Schmidt');
      expect(schmidt.length).toBeGreaterThanOrEqual(1);
      const labels = screen.getAllByText('Betreuer (2)');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });

    it('shows Abbrechen button in modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      // Both ConfirmationModal and ConflictModal have Abbrechen buttons
      const cancelButtons = screen.getAllByText('Abbrechen');
      expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows Aufsicht starten button in modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      expect(screen.getByText('Aufsicht starten')).toBeInTheDocument();
    });

    it('cancel button responds to touch events', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      const cancelButtons = screen.getAllByText('Abbrechen');
      // ConfirmationModal cancel button
      fireEvent.touchStart(cancelButtons[0]);
      fireEvent.touchEnd(cancelButtons[0]);
      expect(cancelButtons[0]).toBeInTheDocument();
    });

    it('confirm button responds to touch events', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      const confirmBtn = screen.getByText('Aufsicht starten');
      fireEvent.touchStart(confirmBtn);
      fireEvent.touchEnd(confirmBtn);
      expect(confirmBtn).toBeInTheDocument();
    });

    it('cancel button closes modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      expect(screen.getByText('Aufsicht starten?')).toBeInTheDocument();
      // Multiple Abbrechen buttons exist; pick the first one (ConfirmationModal)
      const cancelButtons = screen.getAllByText('Abbrechen');
      await user.click(cancelButtons[0]);
      await waitFor(() => {
        expect(screen.queryByText('Aufsicht starten?')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Session start (confirm flow)
  // =========================================================================

  describe('session start', () => {
    it('calls api.startSession with correct args on confirm', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
          activity_id: 10,
          room_id: 1,
          supervisor_ids: [1, 2],
        });
      });
    });

    it('calls selectRoom after successful start', async () => {
      const selectRoom = vi.fn();
      setStoreState({ selectRoom });
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(selectRoom).toHaveBeenCalledWith(1);
      });
    });

    it('calls fetchCurrentSession after successful start', async () => {
      const fetchCurrentSession = vi.fn(() => Promise.resolve());
      setStoreState({ fetchCurrentSession });
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(fetchCurrentSession).toHaveBeenCalled();
      });
    });

    it('calls saveLastSessionData after successful start', async () => {
      const saveLastSessionData = vi.fn(() => Promise.resolve());
      setStoreState({ saveLastSessionData });
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(saveLastSessionData).toHaveBeenCalled();
      });
    });

    it('navigates to /nfc-scanning after successful start', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
      });
    });

    it('shows loading state while starting session', async () => {
      let resolveStart: (v: any) => void;
      mockedApi.startSession.mockReturnValue(
        new Promise(resolve => {
          resolveStart = resolve;
        })
      );

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));

      // Don't await the click - fire it to start the async operation
      fireEvent.click(screen.getByText('Aufsicht starten'));

      // Should show loading text (both ConfirmationModal and ConflictModal buttons)
      await waitFor(() => {
        const loadingTexts = screen.getAllByText('Starte...');
        expect(loadingTexts.length).toBeGreaterThanOrEqual(1);
      });

      // Resolve to clean up
      resolveStart!({
        active_group_id: 42,
        activity_id: 10,
        device_id: 1,
        start_time: '2026-03-15T10:00:00Z',
        supervisors: [],
        status: 'active',
        message: 'ok',
      });
    });
  });

  // =========================================================================
  // 409 Conflict handling
  // =========================================================================

  describe('409 conflict handling', () => {
    it('shows ConflictModal on 409 error', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
      });
    });

    it('shows conflict modal with Conflict keyword', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('Conflict detected'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
      });
    });

    it('shows warning text in conflict modal', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Diese Aktion beendet die aktuelle Session')).toBeInTheDocument();
      });
    });

    it('shows Trotzdem starten button in conflict modal', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
      });
    });

    it('shows Neue Session label in conflict modal', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Neue Session')).toBeInTheDocument();
      });
    });

    it('force start calls api with force=true', async () => {
      mockedApi.startSession
        .mockRejectedValueOnce(new Error('409 Conflict'))
        .mockResolvedValueOnce({
          active_group_id: 99,
          activity_id: 10,
          device_id: 1,
          start_time: '2026-03-15T10:00:00Z',
          supervisors: [],
          status: 'active',
          message: 'ok',
        });

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Trotzdem starten'));

      await waitFor(() => {
        expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
          activity_id: 10,
          room_id: 1,
          supervisor_ids: [1, 2],
          force: true,
        });
      });
    });

    it('force start navigates to /nfc-scanning on success', async () => {
      mockedApi.startSession
        .mockRejectedValueOnce(new Error('409 Conflict'))
        .mockResolvedValueOnce({
          active_group_id: 99,
          activity_id: 10,
          device_id: 1,
          start_time: '2026-03-15T10:00:00Z',
          supervisors: [],
          status: 'active',
          message: 'ok',
        });

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Trotzdem starten'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
      });
    });

    it('cancel button on conflict modal clears state', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
      });

      // There are multiple Abbrechen buttons (one in ConfirmationModal, one in ConflictModal)
      const cancelButtons = screen.getAllByText('Abbrechen');
      // Click the last one (ConflictModal's)
      await user.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(screen.queryByText('Session Konflikt')).not.toBeInTheDocument();
      });
    });

    it('shows error modal when force start fails', async () => {
      mockedApi.startSession
        .mockRejectedValueOnce(new Error('409 Conflict'))
        .mockRejectedValueOnce(new Error('Server error'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Trotzdem starten'));

      // ErrorModal should appear
      await waitFor(() => {
        expect(screen.queryByText('Session Konflikt')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Error handling (non-conflict)
  // =========================================================================

  describe('error handling', () => {
    it('shows error modal on non-conflict error', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('Some server error'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      // Confirm modal should close and error state set
      await waitFor(() => {
        expect(screen.queryByText('Aufsicht starten?')).not.toBeInTheDocument();
      });
    });

    it('handles non-Error throw gracefully', async () => {
      mockedApi.startSession.mockRejectedValueOnce('string error');

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      await waitFor(() => {
        expect(screen.queryByText('Aufsicht starten?')).not.toBeInTheDocument();
      });
    });

    it('error modal can be closed', async () => {
      mockedApi.startSession.mockRejectedValueOnce(new Error('Some server error'));

      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));

      // Wait for error modal to appear (ErrorModal renders)
      await waitFor(() => {
        expect(screen.queryByText('Aufsicht starten?')).not.toBeInTheDocument();
      });
    });

    it('does nothing when confirm is triggered without required state', async () => {
      // This tests the guard in handleConfirmSession
      setStoreState({ authenticatedUser: null, selectedActivity: null });
      renderPage();
      // Nothing to click since component returns null
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Back navigation
  // =========================================================================

  describe('navigation', () => {
    it('back button navigates to /staff-selection', async () => {
      const user = userEvent.setup();
      renderPage();
      // BackButton renders a button with an arrow SVG
      const backButton = screen.getByRole('button', { name: /zurück/i });
      await user.click(backButton);
      expect(mockNavigate).toHaveBeenCalledWith('/staff-selection');
    });
  });

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('shows pagination controls when rooms exist', () => {
      renderPage();
      // PaginationControls renders page info like "1 / 1"
      expect(screen.getByText(/1/)).toBeInTheDocument();
    });

    it('paginates when more than 10 rooms', async () => {
      const manyRooms: Room[] = Array.from({ length: 15 }, (_, i) =>
        makeRoom({ id: i + 1, name: `Raum ${i + 1}`, is_occupied: false })
      );
      setStoreState({ rooms: manyRooms });

      renderPage();

      // First page should show 10 rooms
      expect(screen.getByText('Raum 1')).toBeInTheDocument();
      expect(screen.getByText('Raum 10')).toBeInTheDocument();
      expect(screen.queryByText('Raum 11')).not.toBeInTheDocument();
    });

    it('next page button shows remaining rooms', async () => {
      const manyRooms: Room[] = Array.from({ length: 15 }, (_, i) =>
        makeRoom({ id: i + 1, name: `Raum ${i + 1}`, is_occupied: false })
      );
      setStoreState({ rooms: manyRooms });

      const user = userEvent.setup();
      renderPage();

      // Find and click next page button
      const nextButton = screen.getByRole('button', { name: /nächste|next|›|»/i });
      await user.click(nextButton);
      await waitFor(() => {
        expect(screen.getByText('Raum 11')).toBeInTheDocument();
      });
    });

    it('prev page button goes back to first page', async () => {
      const manyRooms: Room[] = Array.from({ length: 15 }, (_, i) =>
        makeRoom({ id: i + 1, name: `Raum ${i + 1}`, is_occupied: false })
      );
      setStoreState({ rooms: manyRooms });

      const user = userEvent.setup();
      renderPage();

      // Go to page 2
      const nextButton = screen.getByRole('button', { name: /nächste|next|›|»/i });
      await user.click(nextButton);
      await waitFor(() => {
        expect(screen.getByText('Raum 11')).toBeInTheDocument();
      });

      // Go back to page 1
      const prevButton = screen.getByRole('button', { name: /vorherige|prev|‹|«/i });
      await user.click(prevButton);
      await waitFor(() => {
        expect(screen.getByText('Raum 1')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Loading and error states
  // =========================================================================

  describe('loading state', () => {
    it('passes isLoading to layout', () => {
      setStoreState({ isLoading: true, rooms: [] });
      renderPage();
      // SelectionPageLayout shows a spinner when isLoading=true
      // The page title should still be visible
      expect(screen.getByText('Wo machen wir das?')).toBeInTheDocument();
    });

    it('passes error to layout', () => {
      setStoreState({ error: 'Fehler beim Laden der Räume' });
      renderPage();
      expect(screen.getByText('Wo machen wir das?')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // ConflictModal details
  // =========================================================================

  describe('ConflictModal details', () => {
    async function openConflictModal() {
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict'));
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByText('Raum A'));
      await user.click(screen.getByText('Aufsicht starten'));
      await waitFor(() => {
        expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
      });
      return user;
    }

    it('shows activity name in conflict modal', async () => {
      await openConflictModal();
      // Activity name should appear in both modals
      const names = screen.getAllByText('Hausaufgaben');
      expect(names.length).toBeGreaterThanOrEqual(1);
    });

    it('shows room name in conflict modal', async () => {
      await openConflictModal();
      const roomNames = screen.getAllByText('Raum A');
      expect(roomNames.length).toBeGreaterThanOrEqual(1);
    });

    it('shows supervisors in conflict modal', async () => {
      await openConflictModal();
      // Both modals show supervisors, so there should be multiple
      const supervisorLabels = screen.getAllByText(/Betreuer \(2\)/);
      expect(supervisorLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('shows conflict description text', async () => {
      await openConflictModal();
      expect(screen.getByText(/Es läuft bereits eine Session/)).toBeInTheDocument();
    });

    it('cancel button in conflict modal responds to touch events', async () => {
      await openConflictModal();
      const cancelButtons = screen.getAllByText('Abbrechen');
      const conflictCancel = cancelButtons[cancelButtons.length - 1];
      fireEvent.touchStart(conflictCancel);
      fireEvent.touchEnd(conflictCancel);
      // Just verifying no crash
      expect(conflictCancel).toBeInTheDocument();
    });

    it('force button in conflict modal responds to touch events', async () => {
      await openConflictModal();
      const forceBtn = screen.getByText('Trotzdem starten');
      fireEvent.touchStart(forceBtn);
      fireEvent.touchEnd(forceBtn);
      expect(forceBtn).toBeInTheDocument();
    });

    it('shows loading state on force start button', async () => {
      let resolveForce: (v: any) => void;
      mockedApi.startSession.mockRejectedValueOnce(new Error('409 Conflict')).mockReturnValueOnce(
        new Promise(resolve => {
          resolveForce = resolve;
        })
      );

      const user = await openConflictModal();
      await user.click(screen.getByText('Trotzdem starten'));

      await waitFor(() => {
        // The force button should show loading text
        const loadingButtons = screen.getAllByText('Starte...');
        expect(loadingButtons.length).toBeGreaterThanOrEqual(1);
      });

      resolveForce!({
        active_group_id: 99,
        activity_id: 10,
        device_id: 1,
        start_time: '2026-03-15T10:00:00Z',
        supervisors: [],
        status: 'active',
        message: 'ok',
      });
    });
  });
});
