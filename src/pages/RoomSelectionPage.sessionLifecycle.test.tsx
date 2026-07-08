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
  { id: 1, name: 'Raum A', room_type: 'Klassenzimmer', capacity: 30, is_occupied: false },
];

const startResponse = {
  active_group_id: 42,
  activity_id: 10,
  device_id: 1,
  start_time: '2026-03-15T10:00:00Z',
  supervisors: [],
  status: 'active',
  message: 'Session started',
};

function setStoreState(overrides: Record<string, unknown> = {}) {
  useUserStore.setState({
    authenticatedUser: baseUser,
    selectedActivity: testActivity,
    selectedSupervisors: testSupervisors,
    currentSession: null,
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

/** Open the confirmation modal for "Raum A" and confirm the session start */
async function confirmSessionStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Raum A'));
  await user.click(screen.getByText('Aufsicht starten'));
}

describe('RoomSelectionPage session lifecycle behavior', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockedApi.startSession.mockReset();
    mockedApi.startSession.mockResolvedValue(startResponse);
    setStoreState();
  });

  // =========================================================================
  // 409 conflict detection via typed ApiError.statusCode
  // =========================================================================

  it('shows ConflictModal when startSession rejects with ApiError statusCode 409 (no keyword in message)', async () => {
    // Message intentionally contains neither "409" nor "Conflict" so only the
    // typed statusCode check can detect the conflict
    mockedApi.startSession.mockRejectedValueOnce(new ApiError('Raum bereits belegt', 409));

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(screen.getByText('Session Konflikt')).toBeInTheDocument();
    });
  });

  it('does not show ConflictModal for ApiError with non-409 status', async () => {
    mockedApi.startSession.mockRejectedValueOnce(new ApiError('Interner Fehler', 500));

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(screen.getByText('Interner Fehler')).toBeInTheDocument();
    });
    expect(screen.queryByText('Session Konflikt')).not.toBeInTheDocument();
  });

  // =========================================================================
  // Force-start flow after conflict
  // =========================================================================

  it('force start after conflict sets currentSession, calls selectRoom and saveLastSessionData', async () => {
    const selectRoom = vi.fn();
    const saveLastSessionData = vi.fn(() => Promise.resolve());
    setStoreState({ selectRoom, saveLastSessionData });

    mockedApi.startSession
      .mockRejectedValueOnce(new ApiError('Session Konflikt', 409))
      .mockResolvedValueOnce({ ...startResponse, active_group_id: 99 });

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Trotzdem starten'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });

    expect(mockedApi.startSession).toHaveBeenLastCalledWith('1234', {
      activity_id: 10,
      room_id: 1,
      supervisor_ids: [1, 2],
      force: true,
    });
    expect(selectRoom).toHaveBeenCalledWith(1);
    expect(saveLastSessionData).toHaveBeenCalled();

    const { currentSession } = useUserStore.getState();
    expect(currentSession).toMatchObject({
      active_group_id: 99,
      activity_id: 10,
      activity_name: 'Hausaufgaben',
      room_id: 1,
      room_name: 'Raum A',
      is_active: true,
      active_students: 0,
      duration: '0s',
    });
  });

  it('failed force start shows error modal and closes conflict modal', async () => {
    mockedApi.startSession
      .mockRejectedValueOnce(new ApiError('Session Konflikt', 409))
      .mockRejectedValueOnce(new Error('Server kaputt'));

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Trotzdem starten'));

    await waitFor(() => {
      expect(screen.getByText('Server kaputt')).toBeInTheDocument();
    });
    expect(screen.queryByText('Session Konflikt')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/nfc-scanning');
  });

  // =========================================================================
  // Network error path
  // =========================================================================

  it('shows network error message when startSession fails with a network error', async () => {
    mockedApi.startSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(
        screen.getByText('Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Session Konflikt')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/nfc-scanning');
  });

  it('shows network error message when force start fails with a network error', async () => {
    mockedApi.startSession
      .mockRejectedValueOnce(new ApiError('Session Konflikt', 409))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(screen.getByText('Trotzdem starten')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Trotzdem starten'));

    await waitFor(() => {
      expect(
        screen.getByText('Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.')
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Successful start builds the session from the response + local state
  // =========================================================================

  it('successful start builds currentSession from response and local selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await confirmSessionStart(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/nfc-scanning');
    });

    const { currentSession } = useUserStore.getState();
    expect(currentSession).toMatchObject({
      active_group_id: 42,
      activity_id: 10,
      activity_name: 'Hausaufgaben',
      room_id: 1,
      room_name: 'Raum A',
      device_id: 1,
      start_time: '2026-03-15T10:00:00Z',
      duration: '0s',
      is_active: true,
      active_students: 0,
    });
  });
});
