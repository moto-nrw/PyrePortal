import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';


import { ContentBox } from '../components/ui';
import type { ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

const ACTIVITIES_PER_PAGE = 10; // 5x2 grid to match UserSelectionPage

function CreateActivityPage() {
  const { authenticatedUser, isLoading, error, logout, fetchActivities, setSelectedActivity } =
    useUserStore();

  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const mountedRef = useRef(false);
  const fetchedRef = useRef(false);

  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('CreateActivityPage');

  // Calculate pagination
  const totalPages = Math.ceil(activities.length / ACTIVITIES_PER_PAGE);
  const paginatedActivities = React.useMemo(() => {
    const start = currentPage * ACTIVITIES_PER_PAGE;
    const end = start + ACTIVITIES_PER_PAGE;
    return activities.slice(start, end);
  }, [activities, currentPage]);

  // Calculate empty slots to maintain grid layout
  const emptySlots = React.useMemo(() => {
    const activitiesOnPage = paginatedActivities.length;
    if (activitiesOnPage < ACTIVITIES_PER_PAGE) {
      return ACTIVITIES_PER_PAGE - activitiesOnPage;
    }
    return 0;
  }, [paginatedActivities]);

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

      logger.error('Failed to fetch activities', { error });
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

    logger.debug('CreateActivityPage component mounted', {
      user: authenticatedUser?.staffName,
      isAuthenticated: !!authenticatedUser,
    });

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
      logger.debug('CreateActivityPage component unmounted');
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
      logNavigation('CreateActivityPage', 'RoomSelectionPage', {
        reason: 'activity_selected',
        activityId: activity.id,
      });
      void navigate('/rooms');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleActivitySelect'
      );
    }
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
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
      logger.debug('Navigated to next page', { newPage: currentPage + 1, totalPages });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
      logger.debug('Navigated to previous page', { newPage: currentPage - 1, totalPages });
    }
  };

  // Get general activity icon - single universal icon for all activities
  const getCategoryIcon = () => {
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    );
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div style={{ 
        width: '100%', 
        height: '100%',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Modern back button following tablet/mobile conventions */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 28px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '28px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(8px)',
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
            }}
            onTouchEnd={(e) => {
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }
              }, 150);
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#374151"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5"/>
              <path d="M12 19l-7-7 7-7"/>
            </svg>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Zurück
            </span>
          </button>
        </div>

        <h1
          style={{
            fontSize: '36px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: '48px',
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          Aktivität auswählen
        </h1>

        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              padding: theme.spacing.md,
              borderRadius: theme.borders.radius.md,
              marginBottom: theme.spacing.lg,
              textAlign: 'center',
              fontSize: '16px',
            }}
          >
            {error}
          </div>
        )}

        {isLoading || isFetching ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '3px solid #E5E7EB',
                borderTopColor: '#5080D8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : (
          <>
            {/* No activities state */}
            {activities.length === 0 && (
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
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
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
            )}

            {/* Activities Grid */}
            {activities.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '14px',
                  marginBottom: '12px',
                  flex: 1,
                  alignContent: 'start',
                }}
              >
                {paginatedActivities.map((activity) => {
                  const isActive = activity.is_active;
                  return (
                    <button
                      key={activity.id}
                      onClick={() => !isActive && handleActivitySelect(activity)}
                      disabled={isActive}
                      style={{
                        height: '160px',
                        padding: '16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#1F2937',
                        cursor: isActive ? 'not-allowed' : 'pointer',
                        transition: 'all 200ms',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        outline: 'none',
                        position: 'relative',
                        overflow: 'hidden',
                        minWidth: '0',
                        gap: '12px',
                        WebkitTapHighlightColor: 'transparent',
                        opacity: isActive ? 0.6 : 1,
                      }}
                      onTouchStart={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'scale(0.98)';
                          e.currentTarget.style.backgroundColor = '#E6EFFF';
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (!isActive) {
                          setTimeout(() => {
                            if (e.currentTarget) {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }, 150);
                        }
                      }}
                    >
                      {/* Gradient border wrapper - Gray for active, Blue for available */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '12px',
                          background: isActive 
                            ? 'linear-gradient(to right, #9CA3AF, #6B7280)' 
                            : 'linear-gradient(to right, #5080D8, #3f6bc4)',
                          zIndex: 0,
                        }}
                      />
                      
                      {/* Inner content wrapper for border effect */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: '2px',
                          borderRadius: '10px',
                          background: 'linear-gradient(to bottom, #FFFFFF, #F0F4FF)',
                          zIndex: 1,
                        }}
                      />
                      
                      {/* Activity Icon */}
                      <div
                        style={{
                          color: '#5080D8',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        {getCategoryIcon()}
                      </div>
                      
                      {/* Activity Name */}
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          lineHeight: '1.2',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                          color: '#1F2937',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        {activity.name}
                      </span>

                      {/* Enrollment info - only show if data is available */}
                      {activity.enrollment_count !== undefined && activity.max_participants !== undefined && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            position: 'relative',
                            zIndex: 2,
                          }}
                        >
                          {activity.enrollment_count}/{activity.max_participants}
                        </div>
                      )}

                      {/* Activity Status Badge */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: isActive ? '#EF4444' : '#10B981',
                          color: '#FFFFFF',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          zIndex: 3,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="10"/>
                        </svg>
                        {isActive ? 'Aktiv' : 'Verfügbar'}
                      </div>
                    </button>
                  );
                })}
                
                {/* Empty placeholder slots */}
                {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    style={{
                      height: '160px',
                      backgroundColor: '#FAFAFA',
                      border: '2px dashed #E5E7EB',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: 0.4,
                      }}
                    >
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9CA3AF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span
                        style={{
                          fontSize: '14px',
                          color: '#9CA3AF',
                          fontWeight: 400,
                        }}
                      >
                        Leer
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '12px',
                }}
              >
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  style={{
                    height: 'auto',
                    width: 'auto',
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === 0 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    borderRadius: '0',
                    cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 0 ? 0.5 : 1,
                    transition: 'all 200ms',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  ← Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  Seite {currentPage + 1} von {totalPages}
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages - 1}
                  style={{
                    height: 'auto',
                    width: 'auto',
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === totalPages - 1 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    borderRadius: '0',
                    cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages - 1 ? 0.5 : 1,
                    transition: 'all 200ms',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  Nächste →
                </button>
              </div>
            )}
          </>
        )}

        {/* Add animation keyframes */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </ContentBox>
  );
}

export default CreateActivityPage;