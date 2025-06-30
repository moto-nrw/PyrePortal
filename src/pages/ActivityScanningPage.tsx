import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useRfidScanning } from '../hooks/useRfidScanning';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('ActivityScanningPage');

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedActivity, selectedRoom, authenticatedUser, rfid } = useUserStore();

  const { isScanning, currentScan, showModal, startScanning, stopScanning } = useRfidScanning();

  // Debug logging for selectedActivity
  useEffect(() => {
    if (selectedActivity) {
      logger.debug('Selected activity data:', {
        id: selectedActivity.id,
        name: selectedActivity.name,
        max_participants: selectedActivity.max_participants,
        enrollment_count: selectedActivity.enrollment_count,
      });
    }
  }, [selectedActivity]);

  // Debug logging for modal state
  useEffect(() => {
    if (showModal && currentScan) {
      logger.info('Modal should be showing', {
        showModal,
        studentName: currentScan.student_name,
        action: currentScan.action,
      });

      // Additional debug logging
      logger.debug('Modal rendering with currentScan', {
        action: currentScan.action,
        actionCheck: currentScan.action === 'checked_in',
        studentName: currentScan.student_name,
        message: currentScan.message,
        fullScan: currentScan,
      });
    }
  }, [showModal, currentScan]);

  // Track student count based on check-ins
  const [studentCount, setStudentCount] = useState(0);
  // Add initial loading state to prevent emoji flicker
  const [isInitializing, setIsInitializing] = useState(true);

  // Start scanning when component mounts
  useEffect(() => {
    logger.info('Activity Scanning Page mounted, starting RFID scanning');

    // Start scanning and clear initializing state
    const initializeScanning = async () => {
      await startScanning();
      setIsInitializing(false);
    };

    void initializeScanning();

    // Cleanup: stop scanning when component unmounts
    return () => {
      logger.info('Activity Scanning Page unmounting, stopping RFID scanning');
      void stopScanning(); // Handle async function
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Function to fetch current session info
  const fetchSessionInfo = async () => {
    if (!authenticatedUser?.pin) return;

    try {
      const sessionInfo = await api.getCurrentSessionInfo(authenticatedUser.pin);
      logger.debug('Session info received:', sessionInfo ?? {});

      if (sessionInfo) {
        const count = sessionInfo.active_students ?? 0;
        logger.info(`Setting student count to: ${count}`);
        setStudentCount(count);
      } else {
        logger.warn('No session info received');
        setStudentCount(0);
      }
    } catch (error) {
      logger.error('Failed to fetch session info', { error });
    }
  };

  // Initialize and periodically update student count
  useEffect(() => {
    // Initial fetch
    void fetchSessionInfo();

    // Set up periodic updates every 30 seconds (just for sync)
    const interval = setInterval(() => {
      void fetchSessionInfo();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUser?.pin]); // fetchSessionInfo is stable within this component lifecycle

  // Update student count based on scan result
  useEffect(() => {
    if (currentScan && showModal) {
      // Instead of fetching, update count based on scan action
      logger.debug('Updating student count based on scan', {
        action: currentScan.action,
        currentCount: studentCount
      });

      // Only update count for successful actions (not errors or info states)
      const isError = Boolean((currentScan as { showAsError?: boolean }).showAsError);
      const isInfo = Boolean((currentScan as { isInfo?: boolean }).isInfo);

      if (!isError && !isInfo) {
        if (currentScan.action === 'checked_in') {
          setStudentCount(prev => prev + 1);
        } else if (currentScan.action === 'checked_out') {
          setStudentCount(prev => Math.max(0, prev - 1));
        } else if (currentScan.action === 'transferred') {
          // For transfers, check if student is coming to or leaving our room
          const currentRoomName = selectedRoom?.name;
          if (currentScan.room_name === currentRoomName) {
            // Student transferred TO our room from another room
            setStudentCount(prev => prev + 1);
          } else if (currentScan.previous_room === currentRoomName) {
            // Student transferred FROM our room to another room
            setStudentCount(prev => Math.max(0, prev - 1));
          }
          // If neither matches, don't change count (shouldn't happen)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScan, showModal]); // Only update when scan modal shows


  // Auto-close modal after delay
  useEffect(() => {
    if (showModal && currentScan) {
      const timer = setTimeout(() => {
        // Modal will auto-close through the hook
      }, rfid.modalDisplayTime);
      return () => clearTimeout(timer);
    }
  }, [showModal, currentScan, rfid.modalDisplayTime]);

  // Guard clause - if data is missing, show loading or error state
  if (!selectedActivity || !selectedRoom || !authenticatedUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <p className="text-lg text-gray-600">Keine Aktivität ausgewählt</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  const handleAnmelden = () => {
    // Stop scanning temporarily
    void stopScanning(); // Handle async function
    // Navigate to PIN page for teacher access
    void navigate('/pin');
  };

  return (
    <>
      <ContentBox centered shadow="md" rounded="lg">
        {/* Anmelden Button - Top Right of ContentBox */}
        <button
          onClick={handleAnmelden}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
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
            backdropFilter: 'blur(8px)',
            fontSize: '18px',
            fontWeight: 600,
            color: '#374151',
            zIndex: 10,
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Anmelden
        </button>

        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            padding: '24px',
          }}
        >

          {/* Header Section */}
          <div style={{ textAlign: 'center', marginTop: '-40px', marginBottom: '48px' }}>
            <h1
              style={{
                fontSize: '56px',
                fontWeight: 700,
                color: '#1F2937',
                margin: '0 0 20px 0',
                lineHeight: 1.2,
              }}
            >
              {selectedActivity.name}
            </h1>
            <p
              style={{
                fontSize: '32px',
                color: '#6B7280',
                margin: 0,
                fontWeight: 500,
              }}
            >
              {selectedRoom?.name || 'Unbekannt'}
            </p>
          </div>

          {/* Main Student Count Display */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '160px',
                  fontWeight: 800,
                  color: '#83cd2d',
                  lineHeight: 1,
                  marginBottom: '20px',
                }}
              >
                {studentCount ?? 0}
              </div>
              <div
                style={{
                  fontSize: '28px',
                  color: '#6B7280',
                  marginBottom: '12px',
                  fontWeight: 600,
                }}
              >
                Schülern
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#9CA3AF',
                  fontWeight: 500,
                }}
              >
                eingecheckt
              </div>
            </div>
          </div>

          {/* Bottom Info Text */}
          <div
            style={{
              textAlign: 'center',
              paddingTop: '48px',
              paddingBottom: '0',
            }}
          >
            <p
              style={{
                fontSize: '18px',
                color: '#6B7280',
                margin: 0,
                fontWeight: 500,
              }}
            >
              {isInitializing
                ? 'Bitte warten, während der Scanner initialisiert wird...'
                : isScanning
                  ? 'Halte dein Armband auf das bunte Scannersymbol'
                  : 'Scanner ist pausiert'
              }
            </p>
          </div>
        </div>
      </ContentBox>

      {/* Check-in/Check-out Modal */}
      {showModal && currentScan && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: (() => {
                // Check for error or info states
                if ((currentScan as { showAsError?: boolean }).showAsError) return '#ef4444'; // Red for errors
                if ((currentScan as { isInfo?: boolean }).isInfo) return '#6366f1'; // Blue for info
                // Original logic for success states
                return currentScan.action === 'checked_in' || currentScan.action === 'transferred'
                  ? '#83cd2d'
                  : '#f87C10';
              })(),
              borderRadius: '32px',
              padding: '64px',
              maxWidth: '700px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              transform: 'scale(1)',
            }}
          >
            {/* Background pattern for visual interest */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
                pointerEvents: 'none',
              }}
            />

            {/* Icon container with background circle */}
            <div
              style={{
                width: '120px',
                height: '120px',
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 32px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {(() => {
                // Error state - X icon
                if ((currentScan as { showAsError?: boolean }).showAsError) {
                  return (
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  );
                }
                // Info state - Info icon
                if ((currentScan as { isInfo?: boolean }).isInfo) {
                  return (
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  );
                }
                // Success states
                return currentScan.action === 'checked_in' || currentScan.action === 'transferred' ? (
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                );
              })()}
            </div>

            <h2
              style={{
                fontSize: '48px',
                fontWeight: 800,
                marginBottom: '24px',
                color: '#FFFFFF',
                lineHeight: 1.2,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {(() => {
                // Show custom message if available
                if (currentScan.message) return currentScan.message;

                // Error/Info states use student_name as the title
                if ((currentScan as { showAsError?: boolean }).showAsError || (currentScan as { isInfo?: boolean }).isInfo) {
                  return currentScan.student_name;
                }

                // Normal greeting
                return currentScan.action === 'checked_in'
                  ? `Hallo, ${currentScan.student_name}!`
                  : `Tschüss, ${currentScan.student_name}!`;
              })()}
            </h2>

            <div
              style={{
                fontSize: '28px',
                color: 'rgba(255, 255, 255, 0.95)',
                fontWeight: 600,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {(() => {
                switch (currentScan.action) {
                  case 'checked_in':
                    return `Du bist jetzt in ${currentScan.room_name ?? 'diesem Raum'} eingecheckt`;
                  case 'checked_out':
                    return 'Du bist jetzt ausgecheckt';
                  case 'transferred':
                    return 'Raumwechsel erfolgreich';
                  default:
                    return '';
                }
              })()}
            </div>
          </div>

        </div>
      )}

    </>
  );
};

export default ActivityScanningPage;
