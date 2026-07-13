import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiError, type ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';

import CreateActivityPage from './CreateActivityPage';

// ---------------------------------------------------------------------------
// Mock react-router-dom to intercept navigate calls
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
// Fixtures
// ---------------------------------------------------------------------------

const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateActivityPage />
    </MemoryRouter>
  );
}

/** Create a typed fetchActivities mock that rejects with the given error */
function makeFetchActivitiesRejectMock(error: Error) {
  return vi.fn<() => Promise<ActivityResponse[] | null>>(() => Promise.reject(error));
}

// ---------------------------------------------------------------------------
// Tests — 401 detection via ApiError.statusCode with string fallback
// ---------------------------------------------------------------------------

describe('CreateActivityPage 401 status code detection', () => {
  let mockLogout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogout = vi.fn(() => Promise.resolve());

    // Stub performance.mark/measure/getEntriesByName used by the component
    vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark);
    vi.spyOn(performance, 'measure').mockImplementation(() => ({}) as PerformanceMeasure);
    vi.spyOn(performance, 'getEntriesByName').mockReturnValue([
      { duration: 42 } as unknown as PerformanceEntry,
    ]);

    useUserStore.setState({
      authenticatedUser: baseUser,
      isLoading: false,
      error: null,
      selectedActivity: null,
      logout: mockLogout as () => Promise<void>,
    });
  });

  it('calls logout and redirects to / on ApiError with statusCode 401 (no "401" in message)', async () => {
    useUserStore.setState({
      fetchActivities: makeFetchActivitiesRejectMock(new ApiError('Invalid PIN', 401)),
    });
    renderPage();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('calls logout and redirects to / on raw Error containing "401" (string fallback)', async () => {
    useUserStore.setState({
      fetchActivities: makeFetchActivitiesRejectMock(new Error('Request failed: 401')),
    });
    renderPage();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
