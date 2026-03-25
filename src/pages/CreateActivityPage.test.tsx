import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ActivityResponse } from '../services/api';
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
  authenticatedAt: new Date(),
  pin: '1234',
};

function makeActivity(
  overrides: Partial<ActivityResponse> & { id: number; name: string }
): ActivityResponse {
  return {
    category: 'Sport',
    category_name: 'Sport',
    room_name: 'Raum A',
    is_active: false,
    is_occupied: false,
    max_participants: 20,
    enrollment_count: 5,
    ...overrides,
  };
}

const sampleActivities: ActivityResponse[] = [
  makeActivity({ id: 1, name: 'Fußball' }),
  makeActivity({ id: 2, name: 'Basteln', category: 'Kreativ', category_name: 'Kreativ' }),
  makeActivity({ id: 3, name: 'Hausaufgaben', category: 'Lernen', category_name: 'Lernen' }),
];

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

/** Create a typed fetchActivities mock that resolves with the given data */
function makeFetchActivitiesMock(data: ActivityResponse[] | null = sampleActivities) {
  return vi.fn<() => Promise<ActivityResponse[] | null>>(() => Promise.resolve(data));
}

/** Create a typed fetchActivities mock that rejects with the given error */
function makeFetchActivitiesRejectMock(error: Error) {
  return vi.fn<() => Promise<ActivityResponse[] | null>>(() => Promise.reject(error));
}

/** Create a typed fetchActivities mock that rejects with a non-Error value (tests String(error) fallback) */
function makeFetchActivitiesRejectNonErrorMock() {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return vi.fn<() => Promise<ActivityResponse[] | null>>(() => Promise.reject('string error'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateActivityPage', () => {
  let mockFetchActivities: ReturnType<typeof makeFetchActivitiesMock>;
  let mockSetSelectedActivity: ReturnType<typeof vi.fn>;
  let mockLogout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetchActivities = makeFetchActivitiesMock();
    mockSetSelectedActivity = vi.fn();
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
      fetchActivities: mockFetchActivities,
      setSelectedActivity: mockSetSelectedActivity as (activity: ActivityResponse) => void,
      logout: mockLogout as () => Promise<void>,
    });
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it('renders page title when authenticated', () => {
    renderPage();
    expect(screen.getByText('Was machen wir?')).toBeInTheDocument();
  });

  it('returns null and redirects when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = renderPage();
    expect(container.innerHTML).toBe('');
  });

  // -----------------------------------------------------------------------
  // Fetch on mount
  // -----------------------------------------------------------------------

  it('calls fetchActivities on mount', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockFetchActivities).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Activity cards rendering
  // -----------------------------------------------------------------------

  it('renders activity cards with names', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
      expect(screen.getByText('Basteln')).toBeInTheDocument();
      expect(screen.getByText('Hausaufgaben')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Activity selection
  // -----------------------------------------------------------------------

  it('calls setSelectedActivity when clicking an activity card', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fußball'));
    expect(mockSetSelectedActivity).toHaveBeenCalledWith(sampleActivities[0]);
  });

  // -----------------------------------------------------------------------
  // Occupied/disabled activities
  // -----------------------------------------------------------------------

  it('does not call setSelectedActivity for occupied activities (is_occupied)', async () => {
    const occupiedActivities = [makeActivity({ id: 10, name: 'Belegt', is_occupied: true })];
    mockFetchActivities = makeFetchActivitiesMock(occupiedActivities);
    useUserStore.setState({ fetchActivities: mockFetchActivities });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Belegt')).toBeInTheDocument();
    });

    // The button should be disabled
    const button = screen.getByText('Belegt').closest('button');
    expect(button).toBeDisabled();

    // Click should not trigger selection
    await user.click(screen.getByText('Belegt'));
    expect(mockSetSelectedActivity).not.toHaveBeenCalled();
  });

  it('does not call setSelectedActivity for active activities (is_active fallback)', async () => {
    const activeActivities = [
      makeActivity({ id: 11, name: 'Aktiv', is_active: true, is_occupied: undefined }),
    ];
    mockFetchActivities = makeFetchActivitiesMock(activeActivities);
    useUserStore.setState({ fetchActivities: mockFetchActivities });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Aktiv')).toBeInTheDocument();
    });

    const button = screen.getByText('Aktiv').closest('button');
    expect(button).toBeDisabled();
  });

  // -----------------------------------------------------------------------
  // Continue button
  // -----------------------------------------------------------------------

  it('renders continue button disabled when no activity selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
    });

    const continueButton = screen.getByText('Weiter').closest('button');
    expect(continueButton).toBeDisabled();
  });

  it('renders continue button enabled when activity is selected', async () => {
    useUserStore.setState({
      selectedActivity: sampleActivities[0],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
    });

    const continueButton = screen.getByText('Weiter').closest('button');
    expect(continueButton).not.toBeDisabled();
  });

  it('navigates to /staff-selection when continue is clicked with selected activity', async () => {
    useUserStore.setState({
      selectedActivity: sampleActivities[0],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Weiter'));
    expect(mockNavigate).toHaveBeenCalledWith('/staff-selection');
  });

  it('does not navigate when continue is clicked without selected activity', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Fußball')).toBeInTheDocument();
    });

    // Force-click the disabled button via fireEvent (userEvent respects disabled)
    fireEvent.click(screen.getByText('Weiter'));
    expect(mockNavigate).not.toHaveBeenCalledWith('/staff-selection');
  });

  // -----------------------------------------------------------------------
  // Back button
  // -----------------------------------------------------------------------

  it('navigates to /home when back button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Was machen wir?')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Zurück'));
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  // -----------------------------------------------------------------------
  // 401 error → logout + redirect
  // -----------------------------------------------------------------------

  it('calls logout and redirects to / on 401 error', async () => {
    mockFetchActivities = makeFetchActivitiesRejectMock(new Error('401 Unauthorized'));
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('calls logout and redirects to / on Unauthorized error', async () => {
    mockFetchActivities = makeFetchActivitiesRejectMock(new Error('Unauthorized'));
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // -----------------------------------------------------------------------
  // General API error
  // -----------------------------------------------------------------------

  it('handles general API error without logout', async () => {
    mockFetchActivities = makeFetchActivitiesRejectMock(new Error('Network error'));
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    // Should not logout on non-auth errors
    await waitFor(() => {
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  it('handles non-Error rejection', async () => {
    mockFetchActivities = makeFetchActivitiesRejectNonErrorMock();
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    await waitFor(() => {
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Error display from store
  // -----------------------------------------------------------------------

  it('displays error from store', () => {
    useUserStore.setState({ error: 'Etwas ist schiefgelaufen' });
    renderPage();

    expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Empty activity list
  // -----------------------------------------------------------------------

  it('shows empty state when no activities are available', async () => {
    mockFetchActivities = makeFetchActivitiesMock([]);
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Keine Aktivitäten verfügbar')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Sie haben derzeit keine zugewiesenen Aktivitäten.')
    ).toBeInTheDocument();
  });

  it('shows empty state when fetchActivities returns null', async () => {
    mockFetchActivities = makeFetchActivitiesMock(null);
    useUserStore.setState({ fetchActivities: mockFetchActivities });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Keine Aktivitäten verfügbar')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it('shows loading state from store', () => {
    useUserStore.setState({ isLoading: true });
    renderPage();
    // When loading, children (the grid/empty state) should NOT be visible
    expect(screen.queryByText('Keine Aktivitäten verfügbar')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  it('renders pagination controls with many activities', async () => {
    const manyActivities = Array.from({ length: 15 }, (_, i) =>
      makeActivity({ id: i + 1, name: `Aktivität ${i + 1}` })
    );
    mockFetchActivities = makeFetchActivitiesMock(manyActivities);
    useUserStore.setState({ fetchActivities: mockFetchActivities });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Aktivität 1')).toBeInTheDocument();
    });

    // Should show page 1 items but not page 2
    expect(screen.getByText('Aktivität 10')).toBeInTheDocument();
    expect(screen.queryByText('Aktivität 11')).not.toBeInTheDocument();
  });

  it('navigates to next page and back', async () => {
    const manyActivities = Array.from({ length: 15 }, (_, i) =>
      makeActivity({ id: i + 1, name: `Aktivität ${i + 1}` })
    );
    mockFetchActivities = makeFetchActivitiesMock(manyActivities);
    useUserStore.setState({ fetchActivities: mockFetchActivities });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Aktivität 1')).toBeInTheDocument();
    });

    // Find and click next page button
    const nextButton = screen.getByText('Nächste');
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Aktivität 11')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aktivität 1')).not.toBeInTheDocument();

    // Go back to previous page
    const prevButton = screen.getByText('Vorherige');
    await user.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText('Aktivität 1')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: unauthenticated user redirects
  // -----------------------------------------------------------------------

  it('redirects to / when authenticatedUser is null (useEffect)', async () => {
    useUserStore.setState({ authenticatedUser: null });
    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // -----------------------------------------------------------------------
  // Edge: fetchActivitiesData skips when no authenticatedUser
  // -----------------------------------------------------------------------

  it('does not fetch when authenticatedUser is missing', async () => {
    useUserStore.setState({ authenticatedUser: null });
    renderPage();

    // fetchActivities should not be called (guard in fetchActivitiesData)
    await waitFor(() => {
      expect(mockFetchActivities).not.toHaveBeenCalled();
    });
  });
});
