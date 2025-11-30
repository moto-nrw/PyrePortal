import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import type { ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

const ACTIVITIES_PER_PAGE = 10; // 5x2 grid to match UserSelectionPage

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

  // Handle activity selection (no immediate navigation; mirror Team auswählen flow)
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
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <BackgroundWrapper>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
              ...designSystem.components.backButton,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              overflow: 'hidden',
            }}
            onTouchStart={e => {
              e.currentTarget.style.transform = designSystem.scales.activeSmall;
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
              e.currentTarget.style.boxShadow = designSystem.shadows.button;
            }}
            onTouchEnd={e => {
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = designSystem.glass.background;
                  e.currentTarget.style.boxShadow = designSystem.shadows.button;
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
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
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
            fontSize: '56px',
            fontWeight: 700,
            marginTop: '40px',
            marginBottom: '20px',
            textAlign: 'center',
            color: '#111827',
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
            )}

            {/* Activities Grid */}
            {activities.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '14px',
                  marginTop: '24px',
                  marginBottom: '0px',
                  // Remove flex expansion so controls sit closer underneath
                  alignContent: 'start',
                }}
              >
                {paginatedActivities.map(activity => {
                  const isActive = activity.is_active;
                  const isSelected = selectedActivity?.id === activity.id;
                  return (
                    <button
                      key={activity.id}
                      onClick={() => !isActive && handleActivitySelect(activity)}
                      disabled={isActive}
                      style={{
                        width: '100%',
                        height: '160px',
                        backgroundColor: '#FFFFFF',
                        border: isSelected ? '3px solid #83CD2D' : '2px solid #E5E7EB',
                        borderRadius: '24px',
                        cursor: isActive ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        position: 'relative',
                        transition: 'all 150ms ease-out',
                        boxShadow: isSelected
                          ? '0 8px 30px rgba(131, 205, 45, 0.2)'
                          : '0 4px 12px rgba(0, 0, 0, 0.08)',
                        opacity: isActive ? 0.6 : 1,
                      }}
                      onTouchStart={e => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'scale(0.98)';
                        }
                      }}
                      onTouchEnd={e => {
                        if (!isActive) {
                          setTimeout(() => {
                            if (e.currentTarget) {
                              e.currentTarget.style.transform = 'scale(1)';
                            }
                          }, 150);
                        }
                      }}
                    >
                      {/* Removed gradient wrappers to match Team cards */}

                      {/* Selection indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: isSelected
                            ? designSystem.colors.primaryGreen
                            : '#E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 200ms',
                          zIndex: 2,
                        }}
                      >
                        {isSelected && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>

                      {/* Activity Icon - circle tint + dark icon color per spec */}
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          backgroundColor: isSelected
                            ? 'rgba(131,205,45,0.15)'
                            : 'rgba(255,49,48,0.15)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isSelected ? designSystem.colors.primaryGreen : '#e02020',
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

                      {/* No extra info lines or status badge to match Team cards */}
                    </button>
                  );
                })}

                {/* Empty placeholder slots */}
                {emptySlots > 0 &&
                  Array.from({ length: emptySlots }).map((_, index) => (
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
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
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
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  // Match Team page spacing
                  marginTop: '24px',
                  width: '100%',
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
                    justifySelf: 'start',
                  }}
                >
                  <FontAwesomeIcon icon={faChevronLeft} style={{ marginRight: '6px' }} />
                  Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                    justifySelf: 'center',
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
                    justifySelf: 'end',
                  }}
                >
                  Nächste
                  <FontAwesomeIcon icon={faChevronRight} style={{ marginLeft: '6px' }} />
                </button>
              </div>
            )}

            {/* Continue button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                // Match Team page spacing
                marginTop: '24px',
              }}
            >
              <button
                onClick={handleContinue}
                disabled={!selectedActivity}
                style={{
                  height: '56px',
                  padding: '0 48px',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: !selectedActivity
                    ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                    : designSystem.gradients.greenRight,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: !selectedActivity ? 'not-allowed' : 'pointer',
                  transition: designSystem.transitions.base,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: !selectedActivity ? 'none' : designSystem.shadows.green,
                  opacity: !selectedActivity ? 0.6 : 1,
                }}
                onTouchStart={e => {
                  if (selectedActivity) {
                    e.currentTarget.style.transform = designSystem.scales.active;
                    e.currentTarget.style.boxShadow = designSystem.shadows.button;
                  }
                }}
                onTouchEnd={e => {
                  if (selectedActivity) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = designSystem.shadows.green;
                  }
                }}
              >
                Weiter
              </button>
            </div>
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
    </BackgroundWrapper>
  );
}

export default CreateActivityPage;
