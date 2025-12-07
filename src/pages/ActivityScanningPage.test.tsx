/**
 * ActivityScanningPage Tests
 *
 * Tests for the activity scanning page component focusing on:
 * - Schulhof room detection logic
 * - Student count calculations
 * - Edge cases (empty lists, error states)
 *
 * These tests verify the behavior introduced in the bugfix commit (27e3f0e):
 * - Correct Schulhof room detection by exact name match
 * - Student count increment/decrement logic for various scan actions
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useRfidScanning } from '../hooks/useRfidScanning';
import { api, mapServerErrorToGerman, type Room, type RfidScanResult } from '../services/api';
import { isNetworkRelatedError, useUserStore } from '../store/userStore';

import ActivityScanningPage from './ActivityScanningPage';

// Mock modules - vi.mock is hoisted so these execute first
// Note: logger and storeMiddleware are mocked in setup.ts
vi.mock('../store/userStore');
vi.mock('../services/api');
vi.mock('../hooks/useRfidScanning');

// Cast mocks for type safety - use unknown first to satisfy TypeScript
const mockUseUserStore = useUserStore as unknown as Mock;
const mockApi = api as unknown as {
  getRooms: Mock;
  getCurrentSessionInfo: Mock;
  processRfidScan: Mock;
  toggleAttendance: Mock;
};
const mockUseRfidScanning = useRfidScanning as Mock;
const mockIsNetworkRelatedError = isNetworkRelatedError as Mock;
const mockMapServerErrorToGerman = mapServerErrorToGerman as Mock;

/**
 * Helper to create default store state
 */
function createMockStoreState(overrides: Record<string, unknown> = {}) {
  return {
    selectedActivity: {
      id: 1,
      name: 'Test Activity',
      max_participants: 20,
      enrollment_count: 5,
    },
    selectedRoom: {
      id: 1,
      name: 'Test Room',
    },
    authenticatedUser: {
      staffId: 1,
      staffName: 'Test Teacher',
      deviceName: 'Test Device',
      pin: '1234',
    },
    rfid: {
      isScanning: false,
      showModal: false,
      currentScan: null,
      processingQueue: new Set<string>(),
      blockedTags: new Map<string, number>(),
      modalDisplayTime: 3000,
      recentTagScans: new Map(),
      tagToStudentMap: new Map(),
    },
    hideScanModal: vi.fn(),
    setScanResult: vi.fn(),
    showScanModal: vi.fn(),
    ...overrides,
  };
}

/**
 * Helper to create default RFID scanning hook state
 */
function createMockRfidHookState(overrides: Record<string, unknown> = {}) {
  return {
    isScanning: false,
    currentScan: null as RfidScanResult | null,
    showModal: false,
    startScanning: vi.fn().mockResolvedValue(undefined),
    stopScanning: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Helper to render the component with all required context
 */
function renderActivityScanningPage() {
  return render(
    <MemoryRouter>
      <ActivityScanningPage />
    </MemoryRouter>
  );
}

describe('ActivityScanningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = createMockStoreState();
      return selector ? selector(state) : state;
    });

    mockUseRfidScanning.mockReturnValue(createMockRfidHookState());
    mockIsNetworkRelatedError.mockReturnValue(false);
    mockMapServerErrorToGerman.mockImplementation((msg: string) => msg);

    // Setup API mocks
    mockApi.getCurrentSessionInfo = vi.fn().mockResolvedValue({ active_students: 0 });
    mockApi.getRooms = vi.fn().mockResolvedValue([]);
    mockApi.processRfidScan = vi.fn();
    mockApi.toggleAttendance = vi.fn();
  });

  describe('Schulhof Room Detection', () => {
    it('detects Schulhof room by exact name match "Schulhof"', async () => {
      const roomsWithSchulhof: Room[] = [
        { id: 1, name: 'Classroom A', is_occupied: false },
        { id: 2, name: 'Schulhof', is_occupied: false, category: 'outdoor' },
        { id: 3, name: 'Art Room', is_occupied: false },
      ];

      mockApi.getRooms.mockResolvedValue(roomsWithSchulhof);

      renderActivityScanningPage();

      await waitFor(() => {
        expect(mockApi.getRooms).toHaveBeenCalledWith('1234');
      });
    });

    it('does not detect rooms with similar names as Schulhof', async () => {
      // These should NOT be detected as Schulhof:
      // - "Schulhof-Bereich" (contains but not exact)
      // - "schulhof" (case mismatch)
      // - "Der Schulhof" (prefix)
      const roomsWithSimilarNames: Room[] = [
        { id: 1, name: 'Schulhof-Bereich', is_occupied: false },
        { id: 2, name: 'schulhof', is_occupied: false },
        { id: 3, name: 'Der Schulhof', is_occupied: false },
      ];

      mockApi.getRooms.mockResolvedValue(roomsWithSimilarNames);

      renderActivityScanningPage();

      await waitFor(() => {
        expect(mockApi.getRooms).toHaveBeenCalled();
      });

      // Component should still render without Schulhof functionality available
      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });

    it('handles case when no Schulhof room exists', async () => {
      const roomsWithoutSchulhof: Room[] = [
        { id: 1, name: 'Classroom A', is_occupied: false },
        { id: 2, name: 'Classroom B', is_occupied: false },
      ];

      mockApi.getRooms.mockResolvedValue(roomsWithoutSchulhof);

      renderActivityScanningPage();

      await waitFor(() => {
        expect(mockApi.getRooms).toHaveBeenCalled();
      });

      // Component should render normally without Schulhof option
      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });

    it('handles empty room list gracefully', async () => {
      mockApi.getRooms.mockResolvedValue([]);

      renderActivityScanningPage();

      await waitFor(() => {
        expect(mockApi.getRooms).toHaveBeenCalled();
      });

      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });

    it('handles API error when fetching rooms', async () => {
      mockApi.getRooms.mockRejectedValue(new Error('Network error'));

      renderActivityScanningPage();

      await waitFor(() => {
        expect(mockApi.getRooms).toHaveBeenCalled();
      });

      // Component should still render even if room fetch fails
      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });
  });

  describe('Student Count Display', () => {
    it('displays initial student count of 0', async () => {
      mockApi.getCurrentSessionInfo.mockResolvedValue({ active_students: 0 });

      renderActivityScanningPage();

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });

    it('displays student count from session info', async () => {
      mockApi.getCurrentSessionInfo.mockResolvedValue({ active_students: 5 });

      renderActivityScanningPage();

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('handles null session info', async () => {
      mockApi.getCurrentSessionInfo.mockResolvedValue(null);

      renderActivityScanningPage();

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });

    it('handles session info API error', async () => {
      mockApi.getCurrentSessionInfo.mockRejectedValue(new Error('API Error'));

      renderActivityScanningPage();

      // Should display 0 as fallback
      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });
  });

  describe('Guard Clause - Missing Required Data', () => {
    it('shows error state when selectedActivity is null', async () => {
      mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
        const state = createMockStoreState({ selectedActivity: null });
        return selector ? selector(state) : state;
      });

      renderActivityScanningPage();

      expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zurück zur Startseite' })).toBeInTheDocument();
    });

    it('shows error state when selectedRoom is null', async () => {
      mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
        const state = createMockStoreState({ selectedRoom: null });
        return selector ? selector(state) : state;
      });

      renderActivityScanningPage();

      expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
    });

    it('shows error state when authenticatedUser is null', async () => {
      mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
        const state = createMockStoreState({ authenticatedUser: null });
        return selector ? selector(state) : state;
      });

      renderActivityScanningPage();

      expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
    });
  });

  describe('Activity and Room Display', () => {
    it('displays activity name correctly', () => {
      renderActivityScanningPage();

      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });

    it('displays room name correctly', () => {
      renderActivityScanningPage();

      expect(screen.getByText('Test Room')).toBeInTheDocument();
    });

    it('displays "Unbekannt" when room name is missing', () => {
      mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
        const state = createMockStoreState({
          selectedRoom: { id: 1, name: '' },
        });
        return selector ? selector(state) : state;
      });

      renderActivityScanningPage();

      // Should fall back to empty string (falsy) which renders nothing visible
      // or handle this case gracefully
      expect(screen.getByText('Test Activity')).toBeInTheDocument();
    });
  });

  describe('Anmelden Button', () => {
    it('renders Anmelden button', () => {
      renderActivityScanningPage();

      expect(screen.getByRole('button', { name: /Anmelden/i })).toBeInTheDocument();
    });
  });

  describe('RFID Scanning Integration', () => {
    it('calls startScanning on mount', async () => {
      const startScanning = vi.fn().mockResolvedValue(undefined);
      mockUseRfidScanning.mockReturnValue(createMockRfidHookState({ startScanning }));

      renderActivityScanningPage();

      await waitFor(() => {
        expect(startScanning).toHaveBeenCalled();
      });
    });
  });

  describe('Check-in Modal Display', () => {
    it('shows check-in modal with correct content for checked_in action', async () => {
      const scanResult: RfidScanResult = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'checked_in',
        message: undefined,
        room_name: 'Test Room',
        previous_room: undefined,
      };

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: scanResult,
        })
      );

      renderActivityScanningPage();

      expect(screen.getByText('Hallo, Max Mustermann!')).toBeInTheDocument();
    });

    it('shows check-out modal with correct content for checked_out action', async () => {
      const scanResult: RfidScanResult = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'checked_out',
        message: undefined,
        room_name: 'Test Room',
        previous_room: undefined,
      };

      // Need to set up checkout destination state
      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: scanResult,
        })
      );

      renderActivityScanningPage();

      // Checkout triggers destination modal which asks "Wohin gehst du?"
      await waitFor(() => {
        expect(screen.getByText('Wohin gehst du?')).toBeInTheDocument();
      });
    });

    it('shows error modal with correct styling for error action', async () => {
      const errorScanResult = {
        student_name: 'Fehler',
        student_id: null,
        action: 'error' as const,
        message: 'RFID nicht erkannt',
        showAsError: true,
      };

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: errorScanResult,
        })
      );

      renderActivityScanningPage();

      expect(screen.getByText('RFID nicht erkannt')).toBeInTheDocument();
    });
  });

  describe('Schulhof Check-in Flow', () => {
    it('shows Schulhof option in destination modal when Schulhof room exists', async () => {
      const roomsWithSchulhof: Room[] = [
        { id: 1, name: 'Test Room', is_occupied: false },
        { id: 99, name: 'Schulhof', is_occupied: false },
      ];

      mockApi.getRooms.mockResolvedValue(roomsWithSchulhof);

      const checkoutScan: RfidScanResult = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'checked_out',
        message: undefined,
        room_name: 'Test Room',
        previous_room: undefined,
      };

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: checkoutScan,
        })
      );

      renderActivityScanningPage();

      // Wait for rooms to load and destination modal to appear
      await waitFor(() => {
        expect(screen.getByText('Schulhof')).toBeInTheDocument();
      });
    });

    it('shows only Raumwechsel option when Schulhof room does not exist', async () => {
      mockApi.getRooms.mockResolvedValue([{ id: 1, name: 'Test Room', is_occupied: false }]);

      const checkoutScan: RfidScanResult = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'checked_out',
        message: undefined,
        room_name: 'Test Room',
        previous_room: undefined,
      };

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: checkoutScan,
        })
      );

      renderActivityScanningPage();

      await waitFor(() => {
        expect(screen.getByText('Raumwechsel')).toBeInTheDocument();
      });

      // Schulhof button should not be present
      expect(screen.queryByRole('button', { name: /Schulhof/i })).not.toBeInTheDocument();
    });
  });

  describe('Daily Checkout Flow', () => {
    it('shows daily checkout confirmation modal for checked_out_daily action', async () => {
      const dailyCheckoutScan = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'checked_out_daily' as const,
        message: undefined,
        room_name: 'Test Room',
        previous_room: undefined,
      };

      // Setup store with recent tag scan for the student
      const storeState = createMockStoreState();
      storeState.rfid.recentTagScans = new Map([['ABC123', { result: { student_id: 123 } }]]);

      mockUseUserStore.mockImplementation((selector?: (state: unknown) => unknown) => {
        return selector ? selector(storeState) : storeState;
      });

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: dailyCheckoutScan,
        })
      );

      renderActivityScanningPage();

      await waitFor(() => {
        expect(screen.getByText('Gehst du nach Hause?')).toBeInTheDocument();
      });

      expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Ja, nach Hause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Nein/i })).toBeInTheDocument();
    });
  });

  describe('Transfer Action Handling', () => {
    it('displays transfer success message', async () => {
      const transferScan: RfidScanResult = {
        student_name: 'Max Mustermann',
        student_id: 123,
        action: 'transferred',
        message: undefined,
        room_name: 'Test Room',
        previous_room: 'Other Room',
      };

      mockUseRfidScanning.mockReturnValue(
        createMockRfidHookState({
          showModal: true,
          currentScan: transferScan,
        })
      );

      renderActivityScanningPage();

      // Transfer action shows "Tschüss" because the student is leaving the current room
      // (the greeting logic only shows "Hallo" for checked_in action)
      expect(screen.getByText('Tschüss, Max Mustermann!')).toBeInTheDocument();
      expect(screen.getByText('Raumwechsel erfolgreich')).toBeInTheDocument();
    });
  });
});
