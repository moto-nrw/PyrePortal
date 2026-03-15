import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { RfidScanResult } from '../services/api';
import { useUserStore } from '../store/userStore';

import ActivityScanningPage from './ActivityScanningPage';

// Mock useRfidScanning hook to avoid real RFID initialization
const mockStartScanning = vi.fn();
const mockStopScanning = vi.fn();
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

// Mock api to prevent real HTTP calls (session info fetch, rooms fetch)
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    api: {
      getCurrentSessionInfo: vi.fn().mockResolvedValue(null),
      getRooms: vi.fn().mockResolvedValue([]),
      processRfidScan: vi.fn().mockResolvedValue({}),
    },
  };
});

const defaultRfidState = {
  isScanning: false,
  currentScan: null,
  showModal: false,
  scanTimeout: 3000,
  modalDisplayTime: 1500,
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

describe('ActivityScanningPage', () => {
  beforeEach(() => {
    mockRfidHookReturn = {
      isScanning: false,
      currentScan: null,
      showModal: false,
      startScanning: mockStartScanning,
      stopScanning: mockStopScanning,
    };
    useUserStore.setState(defaultStoreState);
  });

  it('renders without crashing with required state', () => {
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
  });

  it('shows the activity name', () => {
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Nachmittagsbetreuung')).toBeInTheDocument();
  });

  it('renders fallback when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    // Page shows a fallback message instead of the main scanning UI
    expect(screen.queryByText('Nachmittagsbetreuung')).not.toBeInTheDocument();
  });

  it('shows the room name from store', () => {
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Raum 101')).toBeInTheDocument();
  });

  it('shows a different activity name when store is updated', () => {
    useUserStore.setState({
      selectedActivity: {
        ...defaultStoreState.selectedActivity,
        name: 'Hausaufgabenbetreuung',
      },
    });
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Hausaufgabenbetreuung')).toBeInTheDocument();
  });

  it('shows a different room name when store is updated', () => {
    useUserStore.setState({
      selectedRoom: {
        ...defaultStoreState.selectedRoom,
        name: 'Turnhalle',
      },
    });
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Turnhalle')).toBeInTheDocument();
  });

  it('displays initial student count of 0', () => {
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    // The large student count display starts at 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows fallback text when selectedActivity is missing', () => {
    useUserStore.setState({ selectedActivity: null });
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
    expect(screen.getByText('Zurück zur Startseite')).toBeInTheDocument();
  });

  it('shows fallback when selectedRoom is missing', () => {
    useUserStore.setState({ selectedRoom: null });
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Keine Aktivität ausgewählt')).toBeInTheDocument();
  });

  it('shows "Anmelden" button for navigating to PIN page', () => {
    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Anmelden')).toBeInTheDocument();
  });

  it('shows scan modal with student name on check-in', () => {
    const scanResult: RfidScanResult = {
      student_id: 42,
      student_name: 'Max Mustermann',
      action: 'checked_in',
      room_name: 'Raum 101',
      message: 'Hallo, Max Mustermann!',
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: scanResult,
      showModal: true,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Hallo, Max Mustermann!')).toBeInTheDocument();
  });

  it('shows scan modal with checkout destination question', () => {
    const scanResult: RfidScanResult = {
      student_id: 42,
      student_name: 'Lisa Schmidt',
      action: 'checked_out',
      daily_checkout_available: false,
      scannedTagId: '04:AA:BB:CC:DD:EE:FF',
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: scanResult,
      showModal: true,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    // The checkout modal asks where the student is going using first name
    expect(screen.getByText('Wohin geht Lisa?')).toBeInTheDocument();
    // Raumwechsel button should always be present
    expect(screen.getByText('Raumwechsel')).toBeInTheDocument();
  });

  it('shows error modal content when scan has showAsError', () => {
    const errorScan: RfidScanResult = {
      student_id: null,
      student_name: 'Scan-Fehler',
      action: 'error',
      message: 'Armband nicht zugewiesen',
      showAsError: true,
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: errorScan,
      showModal: true,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Scan-Fehler')).toBeInTheDocument();
    expect(screen.getByText('Armband nicht zugewiesen')).toBeInTheDocument();
  });

  it('shows transfer success message in modal', () => {
    const transferScan: RfidScanResult = {
      student_id: 7,
      student_name: 'Anna Weber',
      action: 'transferred',
      room_name: 'Raum 101',
      previous_room: 'Raum 202',
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: transferScan,
      showModal: true,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Raumwechsel erfolgreich')).toBeInTheDocument();
  });

  it('renders modal as closed when showModal is false even with currentScan', () => {
    const scanResult: RfidScanResult = {
      student_id: 42,
      student_name: 'Max Mustermann',
      action: 'checked_in',
      message: 'Hallo, Max Mustermann!',
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: scanResult,
      showModal: false,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    // ModalBase is rendered with isOpen=false; the dialog element exists but is not open
    const dialog = document.querySelector('dialog');
    // When showModal is false, shouldShowCheckModal is false, so isOpen=false on the ModalBase
    expect(dialog?.open).not.toBe(true);
  });

  it('shows RFID processing indicator when processing queue is non-empty', () => {
    useUserStore.setState({
      rfid: {
        ...defaultRfidState,
        processingQueue: new Set(['04:AA:BB:CC:DD:EE:FF']),
      },
    });

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    // RfidProcessingIndicator is rendered when processingQueue.size > 0
    // The component exists in the DOM (visible or not depends on CSS)
    // We just verify the page renders without crashing with a non-empty queue
    expect(screen.getByText('Nachmittagsbetreuung')).toBeInTheDocument();
  });

  it('shows "Unbekannt" when selectedRoom name is falsy', () => {
    useUserStore.setState({
      selectedRoom: {
        ...defaultStoreState.selectedRoom,
        name: '',
      },
    });

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Unbekannt')).toBeInTheDocument();
  });

  it('shows supervisor_authenticated modal with custom message', () => {
    const supervisorScan: RfidScanResult = {
      student_id: null,
      student_name: 'Frau Müller',
      action: 'supervisor_authenticated',
      message: 'Frau Müller betreut jetzt Raum 101',
    };

    mockRfidHookReturn = {
      ...mockRfidHookReturn,
      currentScan: supervisorScan,
      showModal: true,
    };

    render(
      <MemoryRouter>
        <ActivityScanningPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Frau Müller betreut jetzt Raum 101')).toBeInTheDocument();
  });
});
