import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox, ErrorModal, SuccessModal } from '../components/ui';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction } from '../utils/logger';

const USERS_PER_PAGE = 10; // 5x2 grid to use full width

function TeamManagementPage() {
  const {
    users,
    fetchTeachers,
    selectedSupervisors,
    toggleSupervisor,
    setSelectedSupervisors,
    isLoading,
    error,
    authenticatedUser,
    currentSession,
  } = useUserStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('TeamManagementPage');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to TeamManagementPage');
      void navigate('/');
      return;
    }

    logger.debug('TeamManagementPage component mounted', {
      user: authenticatedUser.staffName,
      hasActiveSession: !!currentSession,
    });

    return () => {
      logger.debug('TeamManagementPage component unmounted');
    };
  }, [authenticatedUser, currentSession, navigate, logger]);

  // Fetch teachers and initialize supervisors
  useEffect(() => {
    const initializePage = async () => {
      try {
        await fetchTeachers();

        // If we have an active session and no supervisors selected yet,
        // initialize with current session supervisors
        if (currentSession && selectedSupervisors.length === 0) {
          // Fetch current session details to get supervisors
          const sessionDetails = await api.getCurrentSession(authenticatedUser!.pin);
          if (sessionDetails && 'supervisors' in sessionDetails) {
            // Map supervisor info to user format
            const currentSupervisors =
              sessionDetails.supervisors?.map(sup => ({
                id: sup.staff_id,
                name: sup.display_name,
              })) ?? [];
            setSelectedSupervisors(currentSupervisors);
          }
        }
      } catch (error) {
        logger.error('Failed to initialize team management page', { error });
      }
    };

    if (authenticatedUser) {
      void initializePage();
    }
  }, [
    authenticatedUser,
    currentSession,
    fetchTeachers,
    selectedSupervisors.length,
    setSelectedSupervisors,
    logger,
  ]);

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

    logUserAction('team_supervisor_toggle', {
      username: user.name,
      userId: user.id,
      selected: !selectedSupervisors.some(s => s.id === user.id),
    });
  };

  const handleSave = async () => {
    if (selectedSupervisors.length === 0) {
      logger.warn('Attempted to save without selecting supervisors');
      setErrorMessage('Bitte wählen Sie mindestens einen Betreuer aus.');
      setShowErrorModal(true);
      return;
    }

    setIsSaving(true);
    logger.info('Saving team supervisors', {
      count: selectedSupervisors.length,
      supervisors: selectedSupervisors.map(s => ({ id: s.id, name: s.name })),
      hasActiveSession: !!currentSession,
    });

    logUserAction('team_supervisors_save', {
      count: selectedSupervisors.length,
      supervisorIds: selectedSupervisors.map(s => s.id),
      hasActiveSession: !!currentSession,
    });

    try {
      // If we have an active session, update supervisors via API
      if (currentSession) {
        await api.updateSessionSupervisors(
          authenticatedUser!.pin,
          currentSession.active_group_id,
          selectedSupervisors.map(s => s.id)
        );
        logger.info('Successfully updated session supervisors');
      }

      // Show success modal
      setShowSuccessModal(true);

      // Navigate back to home after a short delay
      setTimeout(() => {
        logNavigation('TeamManagementPage', 'HomeViewPage');
        void navigate('/home');
      }, 1500);
    } catch (error) {
      logger.error('Failed to update supervisors', { error });
      setErrorMessage('Fehler beim Aktualisieren der Betreuer. Bitte versuchen Sie es erneut.');
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
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

  // Handle back navigation
  const handleBack = () => {
    logger.info('User navigating back to home');
    logUserAction('team_management_back');
    logNavigation('TeamManagementPage', 'HomeViewPage', { reason: 'user_back' });
    void navigate('/home');
  };

  const isUserSelected = (userId: number) => {
    return selectedSupervisors.some(s => s.id === userId);
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div
        style={{
          width: '100%',
          height: '100%',
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
            fontSize: '36px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: '48px',
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          Team anpassen
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
              {paginatedUsers.map(user => {
                const isSelected = isUserSelected(user.id);
                return (
                  <div
                    key={user.id}
                    style={{
                      background: isSelected
                        ? designSystem.gradients.green
                        : designSystem.gradients.blue,
                      borderRadius: designSystem.borderRadius.xl,
                      padding: '3px',
                      cursor: 'pointer',
                      transition: designSystem.transitions.base,
                      boxShadow: isSelected
                        ? designSystem.shadows.green
                        : designSystem.shadows.blue,
                    }}
                    onTouchStart={e => {
                      e.currentTarget.style.transform = designSystem.scales.activeSmall;
                      e.currentTarget.style.boxShadow = isSelected
                        ? designSystem.shadows.green
                        : designSystem.shadows.blue;
                    }}
                    onTouchEnd={e => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = isSelected
                            ? designSystem.shadows.green
                            : designSystem.shadows.blue;
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
                        borderRadius: `calc(${designSystem.borderRadius.xl} - 3px)`,
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        background: designSystem.gradients.light,
                        backdropFilter: designSystem.glass.blur,
                        WebkitBackdropFilter: designSystem.glass.blur,
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

                      {/* User Icon with modern glass effect */}
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          background: isSelected
                            ? designSystem.gradients.green
                            : designSystem.gradients.blue,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isSelected
                            ? designSystem.shadows.green
                            : designSystem.shadows.blue,
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

            {/* Save button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: '24px',
              }}
            >
              <button
                onClick={handleSave}
                disabled={selectedSupervisors.length === 0 || isSaving}
                style={{
                  height: '56px',
                  padding: '0 48px',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background:
                    selectedSupervisors.length === 0 || isSaving
                      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                      : designSystem.gradients.greenRight,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: selectedSupervisors.length === 0 || isSaving ? 'not-allowed' : 'pointer',
                  transition: designSystem.transitions.base,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow:
                    selectedSupervisors.length === 0 || isSaving
                      ? 'none'
                      : designSystem.shadows.green,
                  opacity: selectedSupervisors.length === 0 || isSaving ? 0.6 : 1,
                }}
                onTouchStart={e => {
                  if (selectedSupervisors.length > 0 && !isSaving) {
                    e.currentTarget.style.transform = designSystem.scales.active;
                    e.currentTarget.style.boxShadow = designSystem.shadows.button;
                  }
                }}
                onTouchEnd={e => {
                  if (selectedSupervisors.length > 0 && !isSaving) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = designSystem.shadows.green;
                  }
                }}
              >
                {isSaving ? 'Speichern...' : 'Team speichern'}
              </button>
            </div>
          </>
        )}

        {/* Success Modal */}
        <SuccessModal
          isOpen={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
          message={
            currentSession ? 'Team erfolgreich aktualisiert!' : 'Team erfolgreich gespeichert!'
          }
          autoCloseDelay={1500}
        />

        {/* Error Modal */}
        <ErrorModal
          isOpen={showErrorModal}
          onClose={() => setShowErrorModal(false)}
          message={errorMessage}
          autoCloseDelay={3000}
        />

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

export default TeamManagementPage;
