import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

const USERS_PER_PAGE = 10; // 5x2 grid to use full width

function UserSelectionPage() {
  const { users, fetchTeachers, setSelectedUser, isLoading, error } = useUserStore();
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();
  
  // Create logger instance for this component
  const logger = createLogger('UserSelectionPage');

  // Log component mount and fetch teachers once
  useEffect(() => {
    logger.debug('UserSelectionPage component mounted');

    // Always fetch teachers on mount (the store will handle deduplication)
    fetchTeachers().catch(error => {
      logger.error('Failed to fetch teachers on mount', { error });
    });

    return () => {
      logger.debug('UserSelectionPage component unmounted');
    };
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

  const handleUserSelect = (userName: string, userId: number | null) => {
    logger.info('User selected from grid', {
      username: userName,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Performance marking for selection flow
    performance.mark('user-select-start');

    setSelectedUser(userName, userId);

    // Log user action and navigation events
    logUserAction('user_select', { username: userName, selectionMethod: 'grid' });
    logNavigation('UserSelectionPage', 'PinPage');

    // Performance measurement
    performance.mark('user-select-end');
    performance.measure('user-select-process', 'user-select-start', 'user-select-end');
    const measure = performance.getEntriesByName('user-select-process')[0];
    logger.debug('User selection performance', { duration_ms: measure.duration });

    void navigate('/pin');
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

  // Handle application quit
  const handleQuit = () => {
    logger.info('User requested application quit');
    logUserAction('quit_app');
    
    invoke('quit_app', {})
      .then(() => {
        logger.debug('Application quit command sent successfully');
      })
      .catch((error) => {
        logError(error instanceof Error ? error : new Error(String(error)), 'UserSelectionPage.handleQuit');
      });
  };

  return (
    <ContentBox centered shadow="md" rounded="lg">
      <div style={{ 
        width: '100%', 
        height: '100%',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Navigation buttons - positioned absolutely */}
        <div
          style={{
            position: 'absolute',
            top: theme.spacing.lg,
            right: theme.spacing.lg,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleQuit}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FF3130',
              backgroundColor: 'transparent',
              border: '1px solid #FF3130',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            Beenden
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
          Benutzer auswählen
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
              borderTopColor: '#14B8A6',
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
            {paginatedUsers.map((user, index) => {
              return (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user.name, user.id)}
                  style={{
                    height: '160px',
                    padding: '16px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#1F2937',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    minWidth: '0',
                    gap: '12px',
                  }}
                  onTouchStart={(e) => {
                    // Visual feedback for touch
                    e.currentTarget.style.transform = 'scale(0.95)';
                    e.currentTarget.style.backgroundColor = '#F0FDFA';
                    e.currentTarget.style.boxShadow = '0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.03)';
                  }}
                  onTouchEnd={(e) => {
                    // Reset visual feedback
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05)';
                      }
                    }, 150);
                  }}
                >
                  {/* Gradient border wrapper */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '12px',
                      background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
                      zIndex: 0,
                    }}
                  />
                  
                  {/* Inner content wrapper for border effect */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: '2px',
                      borderRadius: '10px',
                      background: 'linear-gradient(to bottom, #FFFFFF, #FAFAFA)',
                      zIndex: 1,
                    }}
                  />
                  
                  {/* User Icon */}
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      position: 'relative',
                      zIndex: 2,
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  
                  {/* User Name */}
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
                    {user.name}
                  </span>
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
                  color: currentPage === 0 ? '#9CA3AF' : '#14B8A6',
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
                ← Zurück
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
                  transform: 'translateZ(0)', // Force GPU acceleration
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

export default UserSelectionPage;