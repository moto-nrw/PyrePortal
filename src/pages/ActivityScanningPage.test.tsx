import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useUserStore } from '../store/userStore';

import ActivityScanningPage from './ActivityScanningPage';

// Mock useRfidScanning hook to avoid real RFID initialization
vi.mock('../hooks/useRfidScanning', () => ({
  useRfidScanning: () => ({
    isScanning: false,
    currentScan: null,
    showModal: false,
    startScanning: vi.fn(),
    stopScanning: vi.fn(),
  }),
}));

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

describe('ActivityScanningPage', () => {
  beforeEach(() => {
    useUserStore.setState({
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
    });
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
});
