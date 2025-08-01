import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
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
    authenticatedUser
  } = useUserStore();
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('StaffSelectionPage');

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
      selected: !selectedSupervisors.some(s => s.id === user.id)
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
            fontSize: '36px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: '48px',
            textAlign: 'center',
            color: theme.colors.text.primary,
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
            {/* User Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '14px',
                marginBottom: '24px',
                flex: 1,
                alignContent: 'start',
              }}
            >
              {paginatedUsers.map((user) => {
                const isSelected = isUserSelected(user.id);
                return (
                  <div
                    key={user.id}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, #14B8A6, #0D9488)'
                        : 'linear-gradient(135deg, #5080D8, #3f6bc4)',
                      borderRadius: '20px',
                      padding: '3px',
                      cursor: 'pointer',
                      transition: 'all 200ms',
                      boxShadow: isSelected
                        ? '0 8px 25px rgba(20, 184, 166, 0.25)'
                        : '0 8px 25px rgba(80, 128, 216, 0.15)',
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.transform = 'scale(0.95)';
                      e.currentTarget.style.boxShadow = isSelected
                        ? '0 4px 15px rgba(20, 184, 166, 0.35)'
                        : '0 4px 15px rgba(80, 128, 216, 0.25)';
                    }}
                    onTouchEnd={(e) => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = isSelected
                            ? '0 8px 25px rgba(20, 184, 166, 0.25)'
                            : '0 8px 25px rgba(80, 128, 216, 0.15)';
                        }
                      }, 150);
                    }}
                  >
                    <button
                      onClick={() => handleUserToggle(user)}
                      style={{
                        width: '100%',
                        height: '160px',
                        backgroundColor: '#FFFFFF',
                        border: 'none',
                        borderRadius: '17px',
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        background: 'linear-gradient(to bottom, #FFFFFF, #F8FAFC)',
                        backdropFilter: 'blur(8px)',
                        position: 'relative',
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
                          backgroundColor: isSelected ? '#14B8A6' : '#E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 200ms',
                        }}
                      >
                        {isSelected && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>

                      {/* User Icon with modern glass effect */}
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          background: isSelected
                            ? 'linear-gradient(135deg, #14B8A6, #0D9488)'
                            : 'linear-gradient(135deg, #5080D8, #3f6bc4)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isSelected
                            ? '0 6px 20px rgba(20, 184, 166, 0.3)'
                            : '0 6px 20px rgba(80, 128, 216, 0.3)',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <svg
                          width="36"
                          height="36"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ position: 'relative', zIndex: 1 }}
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>

                      {/* User Name with gradient text */}
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          lineHeight: '1.2',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                          textAlign: 'center',
                          background: 'linear-gradient(135deg, #1F2937, #374151)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        {user.name}
                      </span>
                    </button>
                  </div>
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
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: selectedSupervisors.length === 0
                    ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                    : 'linear-gradient(to right, #14B8A6, #0D9488)',
                  border: 'none',
                  borderRadius: '28px',
                  cursor: selectedSupervisors.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 200ms',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: selectedSupervisors.length === 0
                    ? 'none'
                    : '0 4px 14px 0 rgba(20, 184, 166, 0.4)',
                  opacity: selectedSupervisors.length === 0 ? 0.6 : 1,
                }}
                onTouchStart={(e) => {
                  if (selectedSupervisors.length > 0) {
                    e.currentTarget.style.transform = 'scale(0.98)';
                    e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(20, 184, 166, 0.5)';
                  }
                }}
                onTouchEnd={(e) => {
                  if (selectedSupervisors.length > 0) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(20, 184, 166, 0.4)';
                  }
                }}
              >
                Weiter zum Raum auswählen
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
    </ContentBox>
  );
}

export default StaffSelectionPage;
