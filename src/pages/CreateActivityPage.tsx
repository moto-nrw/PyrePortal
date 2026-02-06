import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ContinueButton,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { usePagination } from '../hooks/usePagination';
import type { ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import {
  createLogger,
  logNavigation,
  logUserAction,
  logError,
  serializeError,
} from '../utils/logger';

function CreateActivityPage() {
  const {
    authenticatedUser,
    isLoading,
    error,
    logout,
    fetchActivities,
    setSelectedActivity,
    selectedActivity,
  } = useUserStore();

  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const mountedRef = useRef(false);
  const fetchedRef = useRef(false);

  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('CreateActivityPage');

  // Pagination hook
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedActivities,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
  } = usePagination(activities, { itemsPerPage: 10 });

  // Fetch activities data with useCallback to prevent recreation
  const fetchActivitiesData = useCallback(async () => {
    if (!authenticatedUser || isFetching) return;

    setIsFetching(true);
    try {
      logger.info('Fetching activities for teacher', {
        staffId: authenticatedUser.staffId,
        staffName: authenticatedUser.staffName,
      });

      performance.mark('activities-fetch-start');
      const activitiesData = await fetchActivities();
      performance.mark('activities-fetch-end');
      performance.measure(
        'activities-fetch-duration',
        'activities-fetch-start',
        'activities-fetch-end'
      );

      const measure = performance.getEntriesByName('activities-fetch-duration')[0];
      logger.debug('Activities fetch performance', { duration_ms: measure.duration });

      if (activitiesData && Array.isArray(activitiesData)) {
        setActivities(activitiesData);
        logger.info('Activities loaded successfully', {
          count: activitiesData.length,
          activities: activitiesData.map(a => ({ id: a.id, name: a.name })),
        });
      } else {
        logger.warn('No activities data returned from fetchActivities');
        setActivities([]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for authentication errors
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        logger.warn('Authentication failed during activity fetch, redirecting to login', {
          error: errorMessage,
        });
        logUserAction('authentication_expired_during_activity_fetch');
        // Logout and redirect to login
        void logout();
        void navigate('/');
        return;
      }

      logger.error('Failed to fetch activities', { error: serializeError(error) });
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.fetchActivitiesData'
      );
    } finally {
      setIsFetching(false);
    }
  }, [authenticatedUser, isFetching, logger, logout, navigate, fetchActivities]);

  // Log component mount/unmount and fetch activities
  useEffect(() => {
    // Prevent double execution in React.StrictMode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Check authentication
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to CreateActivityPage');
      void navigate('/');
      return;
    }

    // Fetch activities on mount only once
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      void fetchActivitiesData();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [authenticatedUser, navigate, logger, fetchActivitiesData]);

  // Handle activity selection (no immediate navigation; mirror Team auswählen flow)
  const handleActivitySelect = (activity: ActivityResponse) => {
    // Don't allow selecting occupied activities (active session running)
    if (activity.is_occupied) return;

    try {
      logger.info('Activity selected', {
        activityId: activity.id,
        activityName: activity.name,
        category: activity.category_name,
        roomName: activity.room_name,
      });

      logUserAction('activity_selected', {
        activityId: activity.id,
        activityName: activity.name,
        category: activity.category_name,
        roomName: activity.room_name,
      });

      // Store the selected activity; navigation happens on Continue
      setSelectedActivity(activity);
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleActivitySelect'
      );
    }
  };

  // Continue to team selection (requires selectedActivity)
  const handleContinue = () => {
    if (!selectedActivity) return;

    logNavigation('CreateActivityPage', 'StaffSelectionPage', {
      reason: 'activity_confirmed',
      activityId: selectedActivity.id,
    });
    void navigate('/staff-selection');
  };

  // Handle back button - navigate to home
  const handleBack = () => {
    try {
      logger.info('User navigating back to home from activity selection');

      logUserAction('activity_selection_back');
      logNavigation('CreateActivityPage', 'HomeViewPage', { reason: 'user_back' });
      void navigate('/home');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleBack'
      );
    }
  };

  const handleNextPage = () => {
    goToNextPage();
  };

  const handlePrevPage = () => {
    goToPrevPage();
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <SelectionPageLayout
      title="Aktivität auswählen"
      onBack={handleBack}
      isLoading={isLoading || isFetching}
      error={error}
    >
      {activities.length === 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '400px',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div
            style={{
              fontSize: '24px',
              color: '#6B7280',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Keine Aktivitäten verfügbar
          </div>
          <div
            style={{
              fontSize: '16px',
              color: '#9CA3AF',
              textAlign: 'center',
            }}
          >
            Sie haben derzeit keine zugewiesenen Aktivitäten.
          </div>
        </div>
      ) : (
        <>
          <SelectableGrid
            items={paginatedActivities}
            renderItem={activity => (
              <SelectableCard
                key={activity.id}
                name={activity.name}
                icon="calendar"
                colorType="activity"
                isSelected={selectedActivity?.id === activity.id}
                isDisabled={!!activity.is_occupied}
                onClick={() => handleActivitySelect(activity)}
              />
            )}
            emptySlotCount={emptySlotCount}
            emptySlotIcon="calendar"
            keyPrefix={`activity-page-${currentPage}`}
          />

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
          />

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <ContinueButton onClick={handleContinue} disabled={!selectedActivity} />
          </div>
        </>
      )}
    </SelectionPageLayout>
  );
}

export default CreateActivityPage;
