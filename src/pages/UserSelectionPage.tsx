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

  // Handle back navigation
  const handleBack = () => {
    logger.info('User navigating back to landing page');
    logUserAction('user_selection_back');
    logNavigation('UserSelectionPage', 'LandingPage', { reason: 'user_back' });
    void navigate('/');
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
        {/* Back button - positioned absolutely */}
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
          Benutzer auswählen
        </h1>

      {error && (
        <div
          style={{
            background: 'linear-gradient(to right, #EF4444, #DC2626)',
            borderRadius: '16px',
            padding: '3px',
            marginBottom: '24px',
            animation: 'modalPop 300ms ease-out',
          }}
        >
          <div
            style={{
              backgroundColor: '#FEF2F2',
              borderRadius: '13px',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#FEE2E2',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <p
              style={{
                color: '#DC2626',
                fontSize: '16px',
                fontWeight: 600,
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '400px',
            gap: '20px',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(to right, #5080D8, #3f6bc4)',
              borderRadius: '20px',
              padding: '3px',
            }}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '17px',
                padding: '32px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  border: '4px solid #E5E7EB',
                  borderTopColor: '#5080D8',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <p
                style={{
                  fontSize: '18px',
                  color: '#6B7280',
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Benutzer werden geladen...
              </p>
            </div>
          </div>
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
              return (
                <div
                  key={user.id}
                  style={{
                    background: 'linear-gradient(135deg, #5080D8, #3f6bc4)',
                    borderRadius: '20px',
                    padding: '3px',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                    boxShadow: '0 8px 25px rgba(80, 128, 216, 0.15)',
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.transform = 'scale(0.95)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(80, 128, 216, 0.25)';
                  }}
                  onTouchEnd={(e) => {
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(80, 128, 216, 0.15)';
                      }
                    }, 150);
                  }}
                >
                  <button
                    onClick={() => handleUserSelect(user.name, user.id)}
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
                    }}
                  >
                    {/* User Icon with modern glass effect */}
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        background: 'linear-gradient(135deg, #5080D8, #3f6bc4)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 6px 20px rgba(80, 128, 216, 0.3)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Glass shine effect */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '-50%',
                          left: '-50%',
                          width: '200%',
                          height: '200%',
                          background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%)',
                          animation: 'shine 2s ease-in-out infinite',
                        }}
                      />
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
          
          @keyframes shine {
            0% {
              transform: translateX(-100%) translateY(-100%) rotate(45deg);
            }
            50% {
              transform: translateX(0%) translateY(0%) rotate(45deg);
            }
            100% {
              transform: translateX(100%) translateY(100%) rotate(45deg);
            }
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

export default UserSelectionPage;