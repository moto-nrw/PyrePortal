import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction } from '../utils/logger';

const USERS_PER_PAGE = 10; // 5x2 grid to use full width

function StaffSelectionPage() {
  const {
    users,
    fetchTeachers,
    selectedSupervisors,
    toggleSupervisor,
    isLoading,
    error,
    selectedActivity,
    authenticatedUser,
  } = useUserStore();
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();

  // Create stable logger instance for this component
  const logger = useMemo(() => createLogger('StaffSelectionPage'), []);

  // Redirect if missing authentication or selected activity
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to StaffSelectionPage');
      void navigate('/');
      return;
    }

    if (!selectedActivity) {
      logger.warn('No activity selected, redirecting to activity selection');
      void navigate('/activity-selection');
      return;
    }

    logger.debug('StaffSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
    });

    return () => {
      logger.debug('StaffSelectionPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, navigate, logger]);

  // Log component mount and fetch teachers once
  useEffect(() => {
    // Always fetch teachers on mount (the store will handle deduplication)
    fetchTeachers().catch(error => {
      logger.error('Failed to fetch teachers on mount', { error });
    });
  }, [fetchTeachers, logger]);

  // Calculate pagination
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = currentPage * USERS_PER_PAGE;
    const end = start + USERS_PER_PAGE;
    return users.slice(start, end);
  }, [users, currentPage]);

  // Calculate empty slots to maintain grid layout
  const emptySlots = useMemo(() => {
    const usersOnPage = paginatedUsers.length;
    if (usersOnPage < USERS_PER_PAGE) {
      return USERS_PER_PAGE - usersOnPage;
    }
    return 0;
  }, [paginatedUsers]);

  const handleUserToggle = (user: { id: number; name: string }) => {
    logger.info('Toggling supervisor selection', {
      username: user.name,
      userId: user.id,
      wasSelected: selectedSupervisors.some(s => s.id === user.id),
    });

    toggleSupervisor(user);

    logUserAction('supervisor_toggle', {
      username: user.name,
      userId: user.id,
      selected: !selectedSupervisors.some(s => s.id === user.id),
    });
  };

  const handleContinue = () => {
    if (selectedSupervisors.length === 0) {
      logger.warn('Attempted to continue without selecting supervisors');
      return;
    }

    logger.info('Continuing with selected supervisors', {
      count: selectedSupervisors.length,
      supervisors: selectedSupervisors.map(s => ({ id: s.id, name: s.name })),
    });

    logUserAction('supervisors_selected', {
      count: selectedSupervisors.length,
      supervisorIds: selectedSupervisors.map(s => s.id),
    });

    logNavigation('StaffSelectionPage', 'RoomSelectionPage');
    void navigate('/rooms');
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

  // Handle back navigation
  const handleBack = () => {
    logger.info('User navigating back to activity selection');
    logUserAction('staff_selection_back');
    logNavigation('StaffSelectionPage', 'CreateActivityPage', { reason: 'user_back' });
    void navigate('/activity-selection');
  };

  const isUserSelected = (userId: number) => {
    return selectedSupervisors.some(s => s.id === userId);
  };

  if (!authenticatedUser || !selectedActivity) {
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
          Betreuer auswählen
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

        {isLoading ? (
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
            {/* User Grid (Team-style cards) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '14px',
                marginTop: '24px',
                marginBottom: '0px',
                alignContent: 'start',
              }}
            >
              {paginatedUsers.map(user => {
                const isSelected = isUserSelected(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleUserToggle(user)}
                    onTouchStart={e => {
                      e.currentTarget.style.transform = 'scale(0.98)';
                    }}
                    onTouchEnd={e => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }, 50);
                    }}
                    style={{
                      width: '100%',
                      height: '160px',
                      backgroundColor: '#FFFFFF',
                      border: isSelected ? '3px solid #83CD2D' : '2px solid #E5E7EB',
                      borderRadius: '24px',
                      cursor: 'pointer',
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
                    }}
                  >
                    {/* Selection indicator */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isSelected ? designSystem.colors.primaryGreen : '#E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 200ms',
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

                    {/* User Icon - circle tint + dark icon color per spec */}
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        backgroundColor: isSelected
                          ? 'rgba(131,205,45,0.15)'
                          : 'rgba(247,140,16,0.15)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? designSystem.colors.primaryGreen : '#e57a00',
                      }}
                    >
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>

                    {/* User Name - Clean black */}
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        lineHeight: '1.2',
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                        textAlign: 'center',
                        color: '#111827',
                      }}
                    >
                      {user.name}
                    </span>
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
                      borderRadius: '20px',
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
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
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
                marginTop: '24px',
              }}
            >
              <button
                onClick={handleContinue}
                disabled={selectedSupervisors.length === 0}
                style={{
                  height: '56px',
                  padding: '0 48px',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background:
                    selectedSupervisors.length === 0
                      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                      : designSystem.gradients.greenRight,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: selectedSupervisors.length === 0 ? 'not-allowed' : 'pointer',
                  transition: designSystem.transitions.base,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: selectedSupervisors.length === 0 ? 'none' : designSystem.shadows.green,
                  opacity: selectedSupervisors.length === 0 ? 0.6 : 1,
                }}
                onTouchStart={e => {
                  if (selectedSupervisors.length > 0) {
                    e.currentTarget.style.transform = designSystem.scales.active;
                    e.currentTarget.style.boxShadow = designSystem.shadows.button;
                  }
                }}
                onTouchEnd={e => {
                  if (selectedSupervisors.length > 0) {
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


          @keyframes modalPop {
            0% {
              transform: scale(0.8);
              opacity: 0;
            }
            50% {
              transform: scale(1.05);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}
        </style>
      </div>
    </BackgroundWrapper>
  );
}

export default StaffSelectionPage;
