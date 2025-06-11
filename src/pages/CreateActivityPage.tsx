import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import type { ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function CreateActivityPage() {
  const {
    authenticatedUser,
    isLoading,
    error,
    logout,
    fetchActivities,
    setSelectedActivity,
  } = useUserStore();

  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const mountedRef = useRef(false);
  const fetchedRef = useRef(false);

  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('ActivitySelectionPage');

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
      performance.measure('activities-fetch-duration', 'activities-fetch-start', 'activities-fetch-end');


      const measure = performance.getEntriesByName('activities-fetch-duration')[0];
      logger.debug('Activities fetch performance', { duration_ms: measure.duration });

      if (activitiesData && Array.isArray(activitiesData)) {
        setActivities(activitiesData);
        logger.info('Activities loaded successfully', { 
          count: activitiesData.length,
          activities: activitiesData.map(a => ({ id: a.id, name: a.name }))
        });
      } else {
        logger.warn('No activities data returned from fetchActivities');
        setActivities([]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      
      // Check for authentication errors
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        logger.warn('Authentication failed during activity fetch, redirecting to login', { error: errorMessage });
        logUserAction('authentication_expired_during_activity_fetch');
        // Logout and redirect to login
        void logout();
        void navigate('/');
        return;
      }
      
      logger.error('Failed to fetch activities', { error });
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'ActivitySelectionPage.fetchActivitiesData'
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

    logger.debug('ActivitySelectionPage component mounted', {
      user: authenticatedUser?.staffName,
      isAuthenticated: !!authenticatedUser,
    });

    // Check authentication
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to ActivitySelectionPage');
      void navigate('/');
      return;
    }

    // Fetch activities on mount only once
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      void fetchActivitiesData();
    }

    return () => {
      logger.debug('ActivitySelectionPage component unmounted');
      mountedRef.current = false;
    };
  }, [authenticatedUser, navigate, logger, fetchActivitiesData]);

  // Handle activity selection
  const handleActivitySelect = (activity: ActivityResponse) => {
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

      // Store the selected activity for the room selection page
      setSelectedActivity(activity);

      // Navigate to room selection with selected activity
      logNavigation('ActivitySelectionPage', 'RoomSelectionPage', {
        reason: 'activity_selected',
        activityId: activity.id,
      });
      void navigate('/rooms');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'ActivitySelectionPage.handleActivitySelect'
      );
    }
  };






  // Handle back button - navigate to home
  const handleBack = () => {
    try {
      logger.info('User navigating back to home from activity selection');

      logUserAction('activity_selection_back');
      logNavigation('ActivitySelectionPage', 'HomeViewPage', { reason: 'user_back' });
      void navigate('/home');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'ActivitySelectionPage.handleBack'
      );
    }
  };

  // Handle logout
  const handleLogout = () => {
    try {
      logger.info('User logging out from activity selection', {
        user: authenticatedUser?.staffName,
      });

      logUserAction('logout_from_activity_selection', {
        username: authenticatedUser?.staffName,
      });

      void logout();

      logNavigation('ActivitySelectionPage', 'LoginPage');
      void navigate('/');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'ActivitySelectionPage.handleLogout'
      );
    }
  };

  // Activity card component (similar to HomeViewPage ActionCard)
  const ActivityCard: React.FC<{
    activity: ActivityResponse;
    onClick: (activity: ActivityResponse) => void;
  }> = ({ activity, onClick }) => {
    const cardStyles: React.CSSProperties = {
      backgroundColor: theme.colors.background.light,
      borderRadius: theme.borders.radius.lg,
      boxShadow: theme.shadows.md,
      padding: theme.spacing.xl,
      cursor: 'pointer',
      transition: theme.animation.transition.fast,
      border: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '200px',
      position: 'relative',
    };

    const getCategoryIcon = (category: string) => {
      switch (category.toLowerCase()) {
        case 'sport': return '⚽';
        case 'kunst': return '🎨';
        case 'musik': return '🎵';
        case 'wissenschaft': return '🔬';
        case 'literatur': return '📚';
        case 'spiele': return '🎲';
        default: return '🎯';
      }
    };

    return (
      <div
        onClick={() => onClick(activity)}
        style={cardStyles}
        className="hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg"
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>
            {getCategoryIcon(activity.category_name)}
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.large,
              fontWeight: theme.fonts.weight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {activity.name}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xs,
            }}
          >
            📍 {activity.room_name}
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xs,
            }}
          >
            👥 {activity.enrollment_count}/{activity.max_participants}
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.small,
              color: activity.has_spots ? '#16a34a' : '#dc2626',
              fontWeight: theme.fonts.weight.medium,
            }}
          >
            {activity.has_spots ? '✅ Verfügbar' : '❌ Voll'}
          </div>
        </div>
      </div>
    );
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }


  return (
    <ContentBox centered shadow="md" rounded="lg">
      <div style={{ width: '100%', maxWidth: '800px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Fixed Header */}
        <div style={{ flexShrink: 0 }}>
          {/* Navigation buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
            <Button onClick={handleBack} variant="outline" size="medium">
              ← Zurück
            </Button>
            <Button onClick={handleLogout} variant="outline" size="small">
              Abmelden
            </Button>
          </div>
          
          {/* Title and info */}
          <div style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
            <h1
              style={{
                fontSize: theme.fonts.size.xxl,
                fontWeight: theme.fonts.weight.bold,
                marginBottom: theme.spacing.lg,
                color: theme.colors.text.primary,
              }}
            >
              Aktivität auswählen
            </h1>
            
            <p
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
              }}
            >
              {authenticatedUser.staffName} • {authenticatedUser.deviceName}
            </p>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: theme.spacing.sm }}>
          {/* Loading state */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              <div style={{ fontSize: theme.fonts.size.large, color: theme.colors.text.secondary }}>
                Lade Aktivitäten...
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: theme.borders.radius.md,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.lg,
              textAlign: 'center',
              color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          {/* Activities grid */}
          {!isLoading && !error && activities.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: theme.spacing.lg,
                width: '100%',
              }}
            >
              {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onClick={handleActivitySelect}
                />
              ))}
            </div>
          )}

          {/* No activities state */}
          {!isLoading && !error && activities.length === 0 && (
            <div style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>📅</div>
              <div style={{
                fontSize: theme.fonts.size.large,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.md,
              }}>
                Keine Aktivitäten verfügbar
              </div>
              <div style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
              }}>
                Sie haben derzeit keine zugewiesenen Aktivitäten.
              </div>
            </div>
          )}
        </div>
      </div>
    </ContentBox>
  );
}

export default CreateActivityPage;
