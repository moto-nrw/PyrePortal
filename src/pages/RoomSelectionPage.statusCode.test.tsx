import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { api, ApiError, type Room, type ActivityResponse } from '../services/api';
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
      startSession: vi.fn(),
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

const availableRooms: Room[] = [
  {
    id: 1,
    name: 'Raum A',
    room_type: 'Klassenzimmer',
    capacity: 30,
    is_occupied: false,
  },
];

function setStoreState() {
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
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RoomSelectionPage />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests — 409 detection via ApiError.statusCode with string fallback
// ---------------------------------------------------------------------------

describe('RoomSelectionPage 409 status code detection', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockReset();
    setStoreState();
  });

  it('shows ConflictModal on ApiError with statusCode 409 (no "409"/"Conflict" in message)', async () => {
    mockedApi.startSession.mockRejectedValueOnce(new ApiError('room already occupied', 409));

    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Raum A'));
    await user.click(screen.getByText('Aufsicht starten'));

    await waitFor(() => {
      expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
    });
  });

  it('shows ConflictModal on raw Error containing "409" (string fallback)', async () => {
    mockedApi.startSession.mockRejectedValueOnce(new Error('API Error: 409 - Conflict'));

    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Raum A'));
    await user.click(screen.getByText('Aufsicht starten'));

    await waitFor(() => {
      expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
    });
  });
});
