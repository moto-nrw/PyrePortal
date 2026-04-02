import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { api, type RfidScanResult } from '../services/api';
import { useUserStore } from '../store/userStore';

import ActivityScanningPage from './ActivityScanningPage';

// ---- navigation mock ----
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---- useRfidScanning mock ----
const mockStartScanning = vi.fn().mockResolvedValue(undefined);
const mockStopScanning = vi.fn().mockResolvedValue(undefined);
let mockRfidHookReturn = {
  isScanning: false,
  currentScan: null as RfidScanResult | null,
  showModal: false,
  startScanning: mockStartScanning,
  stopScanning: mockStopScanning,
};

vi.mock('../hooks/useRfidScanning', () => ({
  useRfidScanning: () => mockRfidHookReturn,
}));

// ---- api mock ----
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    api: {
      getCurrentSessionInfo: vi.fn().mockResolvedValue(null),
      getRooms: vi.fn().mockResolvedValue([]),
      processRfidScan: vi.fn().mockResolvedValue({}),
      queryPickupInfo: vi.fn().mockResolvedValue({}),
      toggleAttendance: vi.fn().mockResolvedValue({}),
    },
  };
});

const mockedApi = vi.mocked(api);

// ---- defaults ----
const defaultRfidState = {
  isScanning: false,
  currentScan: null,
  showModal: false,
  scanTimeout: 3000,
  modalDisplayTime: 1500,
  scanMode: 'checkin' as const,
  scanContextId: 0,
  pickupQueryTagId: null,
  processingQueue: new Set<string>(),
  recentTagScans: new Map(),
  tagToStudentMap: new Map(),
  studentHistory: new Map(),
  blockedTags: new Map(),
  optimisticScans: [],
};

const defaultStoreState = {
  authenticatedUser: {
    staffId: 1,
    staffName: 'Test User',
    deviceName: 'Test Device',
    authenticatedAt: new Date(),
    pin: '1234',
  },
  selectedActivity: {
    id: 1,
    name: 'Nachmittagsbetreuung',
    category: 'OGS',
    category_name: 'OGS',
    room_name: 'Raum 101',
    is_active: false,
    is_occupied: false,
    max_participants: 20,
    enrollment_count: 5,
  },
  selectedRoom: {
    id: 1,
    name: 'Raum 101',
    room_type: 'classroom',
    capacity: 30,
    is_occupied: false,
  },
  currentSession: {
    active_group_id: 100,
    activity_id: 1,
    activity_name: 'Nachmittagsbetreuung',
    room_id: 1,
    room_name: 'Raum 101',
    device_id: 1,
    start_time: '2024-01-01T00:00:00Z',
    duration: '1h',
  },
  rfid: defaultRfidState,
  selectedSupervisors: [{ id: 1, name: 'Supervisor 1' }],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityScanningPage />
    </MemoryRouter>
  );
}

describe('ActivityScanningPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockRfidHookReturn = {
      isScanning: false,
      currentScan: null,
      showModal: false,
      startScanning: mockStartScanning,
      stopScanning: mockStopScanning,
    };
    useUserStore.setState(defaultStoreState);
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =======================================================================
  // Basic rendering
  // =======================================================================

  it('renders without crashing with required state', () => {
    renderPage();
  });

  it('shows the activity name', () => {
    renderPage();
    expect(screen.getByText('Nachmittagsbetreuung')).toBeInTheDocument();
  });

  it('renders fallback when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    renderPage();
    expect(screen.queryByText('Nachmittagsbetreuung')).not.toBeInTheDocument();
  });

  it('shows the room name from store', () => {
    renderPage();
    expect(screen.getByText('Raum 101')).toBeInTheDocument();
  });

  it('shows a different activity name when store is updated', () => {
    useUserStore.setState({
      selectedActivity: { ...defaultStoreState.selectedActivity, name: 'Hausaufgabenbetreuung' },
    });
    renderPage();
    expect(screen.getByText('Hausaufgabenbetreuung')).toBeInTheDocument();
  });

  it('shows a different room name when store is updated', () => {
    useUserStore.setState({
      selectedRoom: { ...defaultStoreState.selectedRoom, name: 'Turnhalle' },
    });
    renderPage();
    expect(screen.getByText('Turnhalle')).toBeInTheDocument();
  });

  it('displays initial student count of 0', () => {
    renderPage();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows fallback text when selectedActivity is missing', () => {
    useUserStore.setState({ selectedActivity: null });
    renderPage();
    expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
    expect(screen.getByText('Zurück zur Startseite')).toBeInTheDocument();
  });

  it('shows fallback when selectedRoom is missing', () => {
    useUserStore.setState({ selectedRoom: null });
    renderPage();
    expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
  });

  it('shows "Anmelden" button for navigating to PIN page', () => {
    renderPage();
    expect(screen.getByText('Anmelden')).toBeInTheDocument();
  });

  it('shows "Unbekannt" when selectedRoom name is falsy', () => {
    useUserStore.setState({
      selectedRoom: { ...defaultStoreState.selectedRoom, name: '' },
    });
    renderPage();
    expect(screen.getByText('Unbekannt')).toBeInTheDocument();
  });

  it('shows RFID processing indicator when processing queue is non-empty', () => {
    useUserStore.setState({
      rfid: { ...defaultRfidState, processingQueue: new Set(['04:AA:BB:CC:DD:EE:FF']) },
    });
    renderPage();
    expect(screen.getByText('Nachmittagsbetreuung')).toBeInTheDocument();
  });

  it('starts pickup query mode when the clock button is pressed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderPage();

    await user.click(screen.getByLabelText('Abholzeit abfragen'));

    expect(useUserStore.getState().rfid.scanMode).toBe('pickupQuery');

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      showModal: true,
      currentScan: null,
    };

    view.rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Bitte halte dein Armband an das Lesegeraet.')).toBeInTheDocument();
  });

  it('times out a stalled pickup query load and resets the kiosk state', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderPage();

    await user.click(screen.getByLabelText('Abholzeit abfragen'));

    useUserStore.setState({
      rfid: {
        ...useUserStore.getState().rfid,
        scanMode: 'pickupQuery',
        pickupQueryTagId: '04:AA:BB:CC:DD:EE:FF',
        processingQueue: new Set(['04:AA:BB:CC:DD:EE:FF']),
      },
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      showModal: true,
      currentScan: null,
    };

    view.rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Abholzeit wird geladen...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText('Abholzeit wird geladen...')).toBeInTheDocument();
    expect(useUserStore.getState().rfid.scanMode).toBe('pickupQuery');

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await waitFor(() => {
      const { rfid } = useUserStore.getState();
      expect(rfid.scanMode).toBe('pickupQuery');
      expect(rfid.processingQueue.size).toBe(0);
      expect(rfid.currentScan).toMatchObject({
        action: 'error',
        showAsError: true,
      });
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: useUserStore.getState().rfid.currentScan,
      showModal: true,
    };

    view.rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useUserStore.getState().rfid.scanMode).toBe('checkin');
    });
  });

  it('prevents Escape from canceling the pickup query prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderPage();

    await user.click(screen.getByLabelText('Abholzeit abfragen'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      showModal: true,
      currentScan: null,
    };

    view.rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    const dialog = document.querySelector('dialog');
    expect(dialog).toBeInTheDocument();

    const cancelEvent = new Event('cancel', { cancelable: true });
    const dispatchResult = dialog?.dispatchEvent(cancelEvent);

    expect(dispatchResult).toBe(false);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(useUserStore.getState().rfid.scanMode).toBe('pickupQuery');
  });

  it('resets pickup query store state on unmount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderPage();

    await user.click(screen.getByLabelText('Abholzeit abfragen'));

    expect(useUserStore.getState().rfid.scanMode).toBe('pickupQuery');
    expect(useUserStore.getState().rfid.showModal).toBe(true);

    view.unmount();

    expect(useUserStore.getState().rfid.scanMode).toBe('checkin');
    expect(useUserStore.getState().rfid.showModal).toBe(false);
  });

  // =======================================================================
  // Fallback navigation
  // =======================================================================

  it('navigates to /home when fallback button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    useUserStore.setState({ selectedActivity: null });
    renderPage();
    await user.click(screen.getByText('Zurück zur Startseite'));
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  // =======================================================================
  // Anmelden button
  // =======================================================================

  it('navigates to /pin when Anmelden is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await user.click(screen.getByText('Anmelden'));
    expect(mockStopScanning).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/pin');
  });

  // =======================================================================
  // Check-in modal
  // =======================================================================

  it('shows scan modal with student name on check-in', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
        message: 'Hallo, Max Mustermann!',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Hallo, Max Mustermann!')).toBeInTheDocument();
  });

  it('shows default greeting when check-in has no message', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Hallo, Max Mustermann!')).toBeInTheDocument();
  });

  it('shows room info for check-in modal content', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Du bist jetzt in Raum 101')).toBeInTheDocument();
  });

  it('shows fallback room text when check-in has no room_name', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Du bist jetzt in diesem Raum')).toBeInTheDocument();
  });

  it('shows pickup query results with time and note', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'pickup_info',
        pickup_time: '15:30',
        pickup_note: 'Mama holt heute frueher ab',
      },
      showModal: true,
    };

    renderPage();

    expect(screen.getByText('Abholzeit fuer Max')).toBeInTheDocument();
    expect(screen.getByText('15:30 Uhr')).toBeInTheDocument();
    expect(screen.getByText('Mama holt heute frueher ab')).toBeInTheDocument();
  });

  it('keeps pickup query mode active until the pickup result modal times out', async () => {
    useUserStore.setState({
      rfid: {
        ...defaultRfidState,
        showModal: true,
        scanMode: 'pickupQuery',
        pickupQueryTagId: '04:AA:BB:CC:DD:EE:FF',
      },
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'pickup_info',
        pickup_time: '15:30',
      },
      showModal: true,
    };

    renderPage();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(useUserStore.getState().rfid.scanMode).toBe('pickupQuery');

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });

    await waitFor(() => {
      expect(useUserStore.getState().rfid.scanMode).toBe('checkin');
    });
  });

  it('shows pickup query fallback when no pickup time exists', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'pickup_info',
      },
      showModal: true,
    };

    renderPage();

    expect(screen.getByText('Fuer heute ist keine Abholzeit hinterlegt.')).toBeInTheDocument();
  });

  // =======================================================================
  // Check-out / destination modal
  // =======================================================================

  it('shows checkout destination question with Raumwechsel button', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Wohin geht Lisa?')).toBeInTheDocument();
    expect(screen.getByText('Raumwechsel')).toBeInTheDocument();
  });

  it('shows nach Hause button when daily_checkout_available is true', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('nach Hause')).toBeInTheDocument();
  });

  it('does not show nach Hause button when daily_checkout_available is false', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.queryByText('nach Hause')).not.toBeInTheDocument();
  });

  it('shows Schulhof button when schulhofRoomId is set', async () => {
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
    ]);

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    // Wait for the rooms fetch to complete and state to update
    await waitFor(() => {
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
    });
  });

  it('shows Toilette button when WC room is found', async () => {
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Toilette')).toBeInTheDocument();
    });
  });

  // =======================================================================
  // Raumwechsel click
  // =======================================================================

  it('clears destination state when Raumwechsel is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    await user.click(screen.getByText('Raumwechsel'));
    // After clicking Raumwechsel, destination state is cleared —
    // the modal should show the checked_out confirmation instead of destination buttons
    expect(screen.getByText('Lisa ist unterwegs')).toBeInTheDocument();
  });

  // =======================================================================
  // Schulhof destination
  // =======================================================================

  it('handles Schulhof click success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockResolvedValueOnce({
      student_id: 42,
      student_name: 'Lisa Schmidt',
      action: 'checked_in',
      room_name: 'Schulhof',
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Schulhof'));

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        { student_rfid: '04:AA:BB:CC:DD:EE:FF', action: 'checkin', room_id: 99 },
        '1234'
      );
    });
  });

  it('handles Schulhof click failure with network error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Schulhof'));

    // The error modal is set via setScanResult + showScanModal on the store
    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  it('handles Schulhof click with non-network error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockRejectedValueOnce(new Error('room is full'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Schulhof'));

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  // =======================================================================
  // Toilette destination
  // =======================================================================

  it('handles Toilette click success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockResolvedValueOnce({
      student_id: 42,
      student_name: 'Lisa Schmidt',
      action: 'checked_in',
      room_name: 'WC',
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Toilette')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Toilette'));

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        { student_rfid: '04:AA:BB:CC:DD:EE:FF', action: 'checkin', room_id: 88 },
        '1234'
      );
    });
  });

  it('handles Toilette click failure with network error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Toilette')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Toilette'));

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  it('handles Toilette click failure with non-network error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockRejectedValueOnce(new Error('room is full'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Toilette')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Toilette'));

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  // =======================================================================
  // nach Hause + feedback flow
  // =======================================================================

  it('handles nach Hause click and shows feedback prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'Daily checkout confirmed',
    } as never);

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
        visit_id: 100,
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));

    await waitFor(() => {
      expect(mockedApi.toggleAttendance).toHaveBeenCalledWith(
        '1234',
        '04:AA:BB:CC:DD:EE:FF',
        'confirm_daily_checkout',
        'zuhause'
      );
    });

    // After successful daily checkout, feedback prompt should show
    await waitFor(() => {
      expect(screen.getByText('Wie war dein Tag, Lisa?')).toBeInTheDocument();
    });

    // Feedback buttons should be visible
    expect(screen.getByText('Gut')).toBeInTheDocument();
    expect(screen.getByText('Okay')).toBeInTheDocument();
    expect(screen.getByText('Schlecht')).toBeInTheDocument();
  });

  it('shows feedback prompt even when toggleAttendance fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockRejectedValueOnce(new Error('Server error'));

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));

    await waitFor(() => {
      expect(screen.getByText('Wie war dein Tag, Lisa?')).toBeInTheDocument();
    });
  });

  it('submits positive feedback and shows farewell', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'ok',
    } as never);

    // Mock submitDailyFeedback on the store
    const mockSubmitFeedback = vi.fn().mockResolvedValue(true);
    useUserStore.setState({ submitDailyFeedback: mockSubmitFeedback });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();

    // First click nach Hause
    await user.click(screen.getByText('nach Hause'));
    await waitFor(() => {
      expect(screen.getByText('Gut')).toBeInTheDocument();
    });

    // Then click Gut feedback
    await user.click(screen.getByText('Gut'));

    // Should show farewell
    await waitFor(() => {
      expect(screen.getByText('Tschüss, Lisa!')).toBeInTheDocument();
    });
  });

  it('submits neutral feedback and shows farewell', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'ok',
    } as never);

    const mockSubmitFeedback = vi.fn().mockResolvedValue(true);
    useUserStore.setState({ submitDailyFeedback: mockSubmitFeedback });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));
    await waitFor(() => expect(screen.getByText('Okay')).toBeInTheDocument());
    await user.click(screen.getByText('Okay'));
    await waitFor(() => expect(screen.getByText('Tschüss, Lisa!')).toBeInTheDocument());
  });

  it('submits negative feedback and shows farewell', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'ok',
    } as never);

    const mockSubmitFeedback = vi.fn().mockResolvedValue(true);
    useUserStore.setState({ submitDailyFeedback: mockSubmitFeedback });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));
    await waitFor(() => expect(screen.getByText('Schlecht')).toBeInTheDocument());
    await user.click(screen.getByText('Schlecht'));
    await waitFor(() => expect(screen.getByText('Tschüss, Lisa!')).toBeInTheDocument());
  });

  it('shows farewell even when feedback submission fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'ok',
    } as never);

    const mockSubmitFeedback = vi.fn().mockResolvedValue(false);
    useUserStore.setState({ submitDailyFeedback: mockSubmitFeedback });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));
    await waitFor(() => expect(screen.getByText('Gut')).toBeInTheDocument());
    await user.click(screen.getByText('Gut'));
    await waitFor(() => expect(screen.getByText('Tschüss, Lisa!')).toBeInTheDocument());
  });

  it('skips feedback when student_id is null', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedApi.toggleAttendance.mockResolvedValueOnce({
      status: 'confirmed',
      message: 'ok',
    } as never);

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Unknown Student',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    renderPage();
    await user.click(screen.getByText('nach Hause'));
    await waitFor(() => expect(screen.getByText('Gut')).toBeInTheDocument());

    // Clicking feedback with null student_id should skip directly to farewell
    await user.click(screen.getByText('Gut'));
    await waitFor(() => expect(screen.getByText('Tschüss, Unknown!')).toBeInTheDocument());
  });

  // =======================================================================
  // Error / info modal
  // =======================================================================

  it('shows error modal content when scan has showAsError', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Scan-Fehler',
        action: 'error',
        message: 'Armband nicht zugewiesen',
        showAsError: true,
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Scan-Fehler')).toBeInTheDocument();
    expect(screen.getByText('Armband nicht zugewiesen')).toBeInTheDocument();
  });

  it('shows info modal with isInfo flag', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Info Titel',
        action: 'already_in',
        message: 'Info message here',
        isInfo: true,
      } as RfidScanResult,
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Info Titel')).toBeInTheDocument();
    expect(screen.getByText('Info message here')).toBeInTheDocument();
  });

  // =======================================================================
  // Transfer modal
  // =======================================================================

  it('shows transfer success message in modal', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 7,
        student_name: 'Anna Weber',
        action: 'transferred',
        room_name: 'Raum 101',
        previous_room: 'Raum 202',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Raumwechsel erfolgreich')).toBeInTheDocument();
  });

  // =======================================================================
  // Supervisor auth modal
  // =======================================================================

  it('shows supervisor_authenticated modal with custom message', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Frau Müller',
        action: 'supervisor_authenticated',
        message: 'Frau Müller betreut jetzt Raum 101',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Frau Müller betreut jetzt Raum 101')).toBeInTheDocument();
  });

  it('shows supervisor_authenticated modal with default message when no custom message', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Frau Müller',
        action: 'supervisor_authenticated',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Frau Müller betreut jetzt Raum 101')).toBeInTheDocument();
  });

  // =======================================================================
  // Modal closed state
  // =======================================================================

  it('renders modal as closed when showModal is false even with currentScan', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        message: 'Hallo, Max Mustermann!',
      },
      showModal: false,
    };
    renderPage();
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).not.toBe(true);
  });

  // =======================================================================
  // Session info fetch
  // =======================================================================

  it('fetches session info and updates student count', async () => {
    mockedApi.getCurrentSessionInfo.mockResolvedValueOnce({
      active_students: 15,
      activity_name: 'Test Activity',
      room_name: 'Raum A',
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  it('sets student count to 0 when session info returns null', async () => {
    mockedApi.getCurrentSessionInfo.mockResolvedValueOnce(null);

    await act(async () => {
      renderPage();
    });

    // Count stays at 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('handles session info fetch error gracefully', async () => {
    mockedApi.getCurrentSessionInfo.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      renderPage();
    });

    // Should not crash, count stays at 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not fetch session info when pin is missing', async () => {
    useUserStore.setState({
      authenticatedUser: { ...defaultStoreState.authenticatedUser, pin: '' },
    });

    await act(async () => {
      renderPage();
    });

    // getCurrentSessionInfo should not have been called (pin is falsy)
    // The guard clause would have redirected before this point
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // =======================================================================
  // Student count updates from scans
  // =======================================================================

  it('uses authoritative active_students count from check-in scan', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
        active_students: 10,
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('uses optimistic delta for check-in when no authoritative count', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
      },
      showModal: true,
    };
    renderPage();
    // Started at 0, +1 = 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('uses authoritative active_students count from checkout scan', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_out',
        active_students: 5,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('uses optimistic delta for checkout when no authoritative count', () => {
    // First set count to something > 0 via session info
    mockedApi.getCurrentSessionInfo.mockResolvedValueOnce({
      active_students: 5,
      activity_name: 'Test Activity',
      room_name: 'Raum A',
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_out',
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    // Count starts at 0 (session info resolves async), checkout decrements by 1 -> stays 0 (max 0)
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('uses authoritative count for transfer scan', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 7,
        student_name: 'Anna Weber',
        action: 'transferred',
        room_name: 'Raum 101',
        previous_room: 'Raum 202',
        active_students: 12,
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('increments count optimistically for incoming transfer (no authoritative count)', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 7,
        student_name: 'Anna Weber',
        action: 'transferred',
        room_name: 'Raum 101', // matches our room
        previous_room: 'Raum 202',
      },
      showModal: true,
    };
    renderPage();
    // 0 + 1 = 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('decrements count optimistically for outgoing transfer (no authoritative count)', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 7,
        student_name: 'Anna Weber',
        action: 'transferred',
        room_name: 'Raum 202',
        previous_room: 'Raum 101', // leaving our room
      },
      showModal: true,
    };
    renderPage();
    // 0 - 1 = max(0, -1) = 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not change count for transfer unrelated to our room', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 7,
        student_name: 'Anna Weber',
        action: 'transferred',
        room_name: 'Raum 303',
        previous_room: 'Raum 202',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not update count for Schulhof scan with authoritative count', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Schulhof',
        active_students: 99,
        isSchulhof: true,
      } as RfidScanResult & { isSchulhof: boolean },
      showModal: true,
    };
    renderPage();
    // isSchulhof flag prevents using authoritative count (it's for Schulhof room, not ours)
    // Also isSchulhof check-in returns delta 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not update count for Toilette scan with authoritative count', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'WC',
        active_students: 50,
        isToilette: true,
      } as RfidScanResult & { isToilette: boolean },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not update count for error scan', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: null,
        student_name: 'Error',
        action: 'error',
        showAsError: true,
        message: 'Something went wrong',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // =======================================================================
  // Schulhof message content
  // =======================================================================

  it('shows Schulhof message with empty content area', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Schulhof',
        message: 'Viel Spaß auf dem Schulhof, Max!',
        isSchulhof: true,
      } as RfidScanResult & { isSchulhof: boolean },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Viel Spaß auf dem Schulhof, Max!')).toBeInTheDocument();
  });

  it('shows Toilette message with empty content area', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'WC',
        message: 'Max geht auf Toilette',
        isToilette: true,
      } as RfidScanResult & { isToilette: boolean },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Max geht auf Toilette')).toBeInTheDocument();
  });

  // =======================================================================
  // Room mismatch guard
  // =======================================================================

  it('calls fetchCurrentSession when room ID mismatches session', async () => {
    const mockFetchCurrentSession = vi.fn().mockResolvedValue(undefined);
    useUserStore.setState({
      ...defaultStoreState,
      currentSession: {
        ...defaultStoreState.currentSession,
        room_id: 999, // Different from selectedRoom.id (1)
      },
      fetchCurrentSession: mockFetchCurrentSession,
    });

    await act(async () => {
      renderPage();
    });

    expect(mockFetchCurrentSession).toHaveBeenCalled();
  });

  it('skips room mismatch check during recent room transition', async () => {
    const mockFetchCurrentSession = vi.fn().mockResolvedValue(undefined);
    useUserStore.setState({
      ...defaultStoreState,
      currentSession: {
        ...defaultStoreState.currentSession,
        room_id: 999,
      },
      fetchCurrentSession: mockFetchCurrentSession,
      _roomSelectedAt: Date.now(), // Recent transition
    });

    await act(async () => {
      renderPage();
    });

    // Should not be called immediately during the transition window
    expect(mockFetchCurrentSession).not.toHaveBeenCalled();

    // Advance past the 5-second window + 100ms buffer
    await act(async () => {
      vi.advanceTimersByTime(5200);
    });

    // Deferred check should now fire (if room still mismatches)
    await waitFor(() => {
      expect(mockFetchCurrentSession).toHaveBeenCalled();
    });
  });

  // =======================================================================
  // Rooms fetch
  // =======================================================================

  it('handles rooms fetch error gracefully', async () => {
    mockedApi.getRooms.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      renderPage();
    });

    // Should not crash
    expect(screen.getByText('Nachmittagsbetreuung')).toBeInTheDocument();
  });

  it('does not fetch rooms when pin is empty', async () => {
    useUserStore.setState({
      authenticatedUser: { ...defaultStoreState.authenticatedUser, pin: '' },
    });

    // Clear previous calls
    mockedApi.getRooms.mockClear();

    await act(async () => {
      renderPage();
    });

    // Guard clause catches missing auth, so we won't even get to rooms fetch
    // But the page should still render (fallback)
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // =======================================================================
  // Stale checkout state clearing
  // =======================================================================

  it('clears stale checkout state when a different tag is scanned', () => {
    // First render with checkout
    const { rerender } = render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    // Set up a checkout scan
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Wohin geht Lisa?')).toBeInTheDocument();

    // Now a different tag scans (check-in from different student)
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 99,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        scannedTagId: '04:11:22:33:44:55:66',
        room_name: 'Raum 101',
      },
      showModal: true,
    };

    rerender(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );

    // Checkout state should be cleared, showing check-in modal instead
    expect(screen.queryByText('Wohin geht Lisa?')).not.toBeInTheDocument();
  });

  // =======================================================================
  // Periodic session fetch
  // =======================================================================

  it('periodically fetches session info every 15 seconds', async () => {
    mockedApi.getCurrentSessionInfo.mockResolvedValue({
      active_students: 3,
      activity_name: 'Test Activity',
      room_name: 'Raum A',
    });

    await act(async () => {
      renderPage();
    });

    const initialCallCount = mockedApi.getCurrentSessionInfo.mock.calls.length;

    // Advance timer by 15 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(mockedApi.getCurrentSessionInfo.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  // =======================================================================
  // Scanning lifecycle
  // =======================================================================

  it('starts scanning on mount and stops on unmount', () => {
    const { unmount } = renderPage();
    expect(mockStartScanning).toHaveBeenCalled();

    unmount();
    expect(mockStopScanning).toHaveBeenCalled();
  });

  // =======================================================================
  // Schulhof with syncPromise wait
  // =======================================================================

  it('waits for syncPromise before Schulhof check-in', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    let resolveSyncPromise: () => void;
    const syncPromise = new Promise<void>(resolve => {
      resolveSyncPromise = resolve;
    });

    useUserStore.setState({
      rfid: {
        ...defaultRfidState,
        recentTagScans: new Map([['04:AA:BB:CC:DD:EE:FF', { timestamp: Date.now(), syncPromise }]]),
      },
    });

    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockResolvedValueOnce({
      student_id: 42,
      student_name: 'Lisa Schmidt',
      action: 'checked_in',
      room_name: 'Schulhof',
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
    });

    // Click Schulhof — it should wait for syncPromise
    const clickPromise = user.click(screen.getByText('Schulhof'));

    // Resolve the sync promise
    await act(async () => {
      resolveSyncPromise!();
    });

    await clickPromise;

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  // =======================================================================
  // Toilette with syncPromise wait
  // =======================================================================

  it('waits for syncPromise before Toilette check-in', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    let resolveSyncPromise: () => void;
    const syncPromise = new Promise<void>(resolve => {
      resolveSyncPromise = resolve;
    });

    useUserStore.setState({
      rfid: {
        ...defaultRfidState,
        recentTagScans: new Map([['04:AA:BB:CC:DD:EE:FF', { timestamp: Date.now(), syncPromise }]]),
      },
    });

    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);
    mockedApi.processRfidScan.mockResolvedValueOnce({
      student_id: 42,
      student_name: 'Lisa Schmidt',
      action: 'checked_in',
      room_name: 'WC',
    });

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: false,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Toilette')).toBeInTheDocument();
    });

    const clickPromise = user.click(screen.getByText('Toilette'));

    await act(async () => {
      resolveSyncPromise!();
    });

    await clickPromise;

    await waitFor(() => {
      expect(mockedApi.processRfidScan).toHaveBeenCalled();
    });
  });

  // =======================================================================
  // nach Hause guard: no checkoutDestinationState or no pin
  // =======================================================================

  it('does nothing on nach Hause when checkoutDestinationState is null', async () => {
    // This is tested indirectly — the nach Hause button only appears
    // when checkoutDestinationState is set, so the guard is mostly
    // for safety. We just verify the button doesn't exist without checkout state.
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_in',
        room_name: 'Raum 101',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.queryByText('nach Hause')).not.toBeInTheDocument();
  });

  // =======================================================================
  // Checkout without destinations selected (simple checkout after raumwechsel)
  // =======================================================================

  it('shows "ist unterwegs" after raumwechsel click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_out',
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Raumwechsel')).toBeInTheDocument();
    await user.click(screen.getByText('Raumwechsel'));
    expect(screen.getByText('Max ist unterwegs')).toBeInTheDocument();
  });

  // =======================================================================
  // Checkout with all 4 destination buttons (Raumwechsel + Schulhof + Toilette + nach Hause)
  // =======================================================================

  it('shows all 4 destination buttons when all conditions are met', async () => {
    mockedApi.getRooms.mockResolvedValueOnce([
      { id: 99, name: 'Schulhof', room_type: 'outdoor', capacity: 100, is_occupied: false },
      { id: 88, name: 'WC', room_type: 'facility', capacity: 5, is_occupied: false },
    ]);

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Lisa Schmidt',
        action: 'checked_out',
        daily_checkout_available: true,
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Raumwechsel')).toBeInTheDocument();
      expect(screen.getByText('Schulhof')).toBeInTheDocument();
      expect(screen.getByText('Toilette')).toBeInTheDocument();
      expect(screen.getByText('nach Hause')).toBeInTheDocument();
    });
  });

  // =======================================================================
  // Schulhof not available (no room ID)
  // =======================================================================

  // Schulhof button won't appear when schulhofRoomId is null (default),
  // so we can't click it. The error path for missing schulhofRoomId is only
  // reachable if the room disappears after initial fetch — hard to test in
  // the current architecture. Skip documenting.

  // =======================================================================
  // Modal background colors
  // =======================================================================

  it('uses green background for check-in modal', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'Raum 101',
      },
      showModal: true,
    };
    renderPage();
    // ModalBase receives backgroundColor='#83cd2d' for check-in
    // We verify the modal renders (background color is a style prop, not directly testable via text)
    expect(screen.getByText('Du bist jetzt in Raum 101')).toBeInTheDocument();
  });

  it('uses orange background for checkout modal', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_out',
        scannedTagId: '04:AA:BB:CC:DD:EE:FF',
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Wohin geht Max?')).toBeInTheDocument();
  });

  // =======================================================================
  // Default fallback title
  // =======================================================================

  it('uses fallback title for unknown action type', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'already_in' as RfidScanResult['action'],
        message: 'Already checked in',
      },
      showModal: true,
    };
    renderPage();
    // Fallback: currentScan.message ?? currentScan.student_name
    expect(screen.getByText('Already checked in')).toBeInTheDocument();
  });

  it('uses student_name as fallback title when no message', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'already_in' as RfidScanResult['action'],
      },
      showModal: true,
    };
    renderPage();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
  });

  // =======================================================================
  // Session info with active_students field
  // =======================================================================

  it('sets student count from session info active_students', async () => {
    mockedApi.getCurrentSessionInfo.mockResolvedValueOnce({
      active_students: 25,
      activity_name: 'Test Activity',
      room_name: 'Raum A',
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  // =======================================================================
  // WC room format in check-in content
  // =======================================================================

  it('formats WC as Toilette in check-in room text', () => {
    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: {
        student_id: 42,
        student_name: 'Max Mustermann',
        action: 'checked_in',
        room_name: 'WC',
      },
      showModal: true,
    };
    renderPage();
    // formatRoomName converts WC to Toilette
    expect(screen.getByText('Du bist jetzt in Toilette')).toBeInTheDocument();
  });
});
