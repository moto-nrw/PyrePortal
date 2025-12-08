import { faFaceSmile, faFaceMeh, faFaceFrown, faChildren } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { useRfidScanning } from '../hooks/useRfidScanning';
import {
  api,
  mapServerErrorToGerman,
  type RfidScanResult,
  type DailyFeedbackRating,
} from '../services/api';
import { useUserStore, isNetworkRelatedError } from '../store/userStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('ActivityScanningPage');

/**
 * Timeout duration (in milliseconds) for daily checkout/destination modals.
 * 7 seconds provides a quick flow while still giving students time to respond.
 */
const DAILY_CHECKOUT_TIMEOUT_MS = 7000;

// Button style constants for consistent styling (matching Check In/Check Out modal patterns)
const FEEDBACK_BUTTON_STYLES = {
  base: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    border: '3px solid rgba(255, 255, 255, 0.5)',
    borderRadius: '20px',
    color: '#FFFFFF',
    padding: '24px 32px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '12px',
    minWidth: '140px',
  },
  hover: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: 'scale(1.05)',
  },
  normal: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: 'scale(1)',
  },
};

const DESTINATION_BUTTON_STYLES = {
  base: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    border: '3px solid rgba(255, 255, 255, 0.5)',
    borderRadius: '20px',
    color: '#FFFFFF',
    fontSize: '32px',
    fontWeight: 700,
    padding: '32px 48px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    width: '280px',
  },
  hover: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: 'scale(1.05)',
  },
  normal: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: 'scale(1)',
  },
};

// Button configuration arrays
const feedbackButtons = [
  { rating: 'positive' as DailyFeedbackRating, icon: faFaceSmile, label: 'Gut' },
  { rating: 'neutral' as DailyFeedbackRating, icon: faFaceMeh, label: 'Okay' },
  { rating: 'negative' as DailyFeedbackRating, icon: faFaceFrown, label: 'Schlecht' },
];

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedActivity, selectedRoom, authenticatedUser, rfid } = useUserStore();

  const { currentScan, showModal, startScanning, stopScanning } = useRfidScanning();

  // Get access to the store's RFID functions
  const { recentTagScans } = useUserStore(state => state.rfid);
  const { hideScanModal, setScanResult, showScanModal } = useUserStore();

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
  // Removed initial loading indicator (arrow removed)

  // State for daily checkout flow
  const [dailyCheckoutState, setDailyCheckoutState] = useState<{
    rfid: string;
    studentName: string;
    showingFarewell: boolean;
  } | null>(null);

  // State for checkout destination selection (Schulhof or Raumwechsel)
  const [checkoutDestinationState, setCheckoutDestinationState] = useState<{
    rfid: string;
    studentName: string;
    studentId: number | null;
  } | null>(null);

  // Feedback prompt state
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);

  // Schulhof room ID (discovered dynamically from server)
  const [schulhofRoomId, setSchulhofRoomId] = useState<number | null>(null);

  // Start scanning when component mounts
  useEffect(() => {
    const mountTimestamp = Date.now();
    logger.info('[RACE-DEBUG] Activity Scanning Page MOUNTED', {
      timestamp: mountTimestamp,
      page: 'ActivityScanningPage',
    });

    // Start scanning and clear initializing state
    const initializeScanning = async () => {
      logger.info('[RACE-DEBUG] Calling startScanning() from page mount', {
        timestamp: Date.now(),
        timeSinceMount: Date.now() - mountTimestamp,
      });
      await startScanning();
    };

    void initializeScanning();

    // Cleanup: stop scanning when component unmounts
    return () => {
      const unmountTimestamp = Date.now();
      logger.info('[RACE-DEBUG] Activity Scanning Page UNMOUNTING', {
        timestamp: unmountTimestamp,
        page: 'ActivityScanningPage',
        timeSinceMount: unmountTimestamp - mountTimestamp,
      });
      logger.info('[RACE-DEBUG] Calling stopScanning() from page unmount', {
        timestamp: unmountTimestamp,
      });
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

  // Fetch Schulhof room ID once on page mount
  useEffect(() => {
    const fetchSchulhofRoom = async () => {
      if (!authenticatedUser?.pin) return;

      try {
        logger.debug('Fetching rooms to find Schulhof');
        const rooms = await api.getRooms(authenticatedUser.pin);

        // Find Schulhof room by name (consistent with backend name-based detection)
        const schulhofRoom = rooms.find(r => r.name === 'Schulhof');

        if (schulhofRoom) {
          setSchulhofRoomId(schulhofRoom.id);
          logger.info('Found Schulhof room', {
            id: schulhofRoom.id,
            name: schulhofRoom.name,
            category: schulhofRoom.category,
          });
        } else {
          logger.warn('No Schulhof room found in available rooms - Schulhof button will not work');
          // Don't fail - just won't show Schulhof option
        }
      } catch (error) {
        logger.error('Failed to fetch Schulhof room', { error });
        // Non-critical error - continue without Schulhof functionality
      }
    };

    void fetchSchulhofRoom();
  }, [authenticatedUser?.pin]);

  // Update student count based on scan result
  useEffect(() => {
    if (currentScan && showModal) {
      // Instead of fetching, update count based on scan action
      logger.debug('Updating student count based on scan', {
        action: currentScan.action,
        currentCount: studentCount,
      });

      // Only update count for successful actions (not errors or info states)
      const isError = Boolean((currentScan as { showAsError?: boolean }).showAsError);
      const isInfo = Boolean((currentScan as { isInfo?: boolean }).isInfo);

      if (!isError && !isInfo) {
        if (currentScan.action === 'checked_in') {
          // Don't increment for Schulhof check-in (student is leaving this room, not entering)
          if (!(currentScan as { isSchulhof?: boolean }).isSchulhof) {
            setStudentCount(prev => prev + 1);
          }
        } else if (currentScan.action === 'checked_out') {
          // Find the RFID tag from recent scans
          let rfidTag = '';
          for (const [tag, scan] of recentTagScans.entries()) {
            if (scan.result?.student_id === currentScan.student_id) {
              rfidTag = tag;
              break;
            }
          }

          // Show destination selection modal
          setCheckoutDestinationState({
            rfid: rfidTag,
            studentName: currentScan.student_name,
            studentId: currentScan.student_id,
          });

          setStudentCount(prev => Math.max(0, prev - 1));
        } else if ((currentScan.action as string) === 'checked_out_daily') {
          // Handle daily checkout - find the RFID tag from recent scans
          let rfidTag = '';

          // Look through recent tag scans to find the one for this student
          for (const [tag, scan] of recentTagScans.entries()) {
            if (scan.result?.student_id === currentScan.student_id) {
              rfidTag = tag;
              break;
            }
          }

          // Set up daily checkout state
          setDailyCheckoutState({
            rfid: rfidTag,
            studentName: currentScan.student_name,
            showingFarewell: false,
          });

          // Update student count - they're checking out of the room
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
      // Use 10 seconds for daily checkout, otherwise use default modal display time
      const timeout = dailyCheckoutState ? DAILY_CHECKOUT_TIMEOUT_MS : rfid.modalDisplayTime;

      const timer = setTimeout(() => {
        // For daily checkout, clean up state if no action taken
        if (dailyCheckoutState && !dailyCheckoutState.showingFarewell) {
          setDailyCheckoutState(null);
        }
        // Modal will auto-close through the hook
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [showModal, currentScan, rfid.modalDisplayTime, dailyCheckoutState]);

  // Auto-close destination modal after configured duration
  useEffect(() => {
    if (checkoutDestinationState) {
      const timer = setTimeout(() => {
        logger.info('Destination modal auto-dismissed after timeout');
        setCheckoutDestinationState(null);
        hideScanModal();
      }, DAILY_CHECKOUT_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [checkoutDestinationState, hideScanModal]);

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

  // Handle daily checkout confirmation
  const handleDailyCheckoutConfirm = async () => {
    if (!dailyCheckoutState || !authenticatedUser?.pin) return;

    try {
      logger.info('Processing daily checkout attendance toggle', {
        rfid: dailyCheckoutState.rfid,
        studentName: dailyCheckoutState.studentName,
      });

      // Call attendance toggle API - use 'cancel' to log out for the day
      await api.toggleAttendance(authenticatedUser.pin, dailyCheckoutState.rfid, 'cancel');

      logger.info('Daily checkout attendance toggle successful');

      // Show feedback prompt instead of farewell
      setShowFeedbackPrompt(true);
    } catch (error) {
      logger.error('Failed to toggle attendance', { error });

      // Show error modal with network-aware message
      const userFriendlyError = isNetworkRelatedError(error)
        ? 'Netzwerkfehler beim Abmelden. Bitte Verbindung prüfen und erneut versuchen.'
        : mapServerErrorToGerman(
            error instanceof Error ? error.message : 'Abmeldung fehlgeschlagen'
          );

      const errorResult: RfidScanResult = {
        student_name: 'Abmeldung fehlgeschlagen',
        student_id: null,
        action: 'error',
        message: `${dailyCheckoutState.studentName}: ${userFriendlyError}`,
        showAsError: true,
      };

      setScanResult(errorResult);
      setDailyCheckoutState(null);
      setShowFeedbackPrompt(false);
      showScanModal();

      // Auto-close after display time
      setTimeout(() => {
        hideScanModal();
      }, rfid.modalDisplayTime);
    }
  };

  // Handle feedback submission
  const handleFeedbackSubmit = async (rating: DailyFeedbackRating) => {
    if (!dailyCheckoutState || !currentScan) return;

    const { submitDailyFeedback } = useUserStore.getState();

    logger.info('Submitting feedback', {
      studentId: currentScan.student_id,
      rating,
    });

    // Guard against null student_id (shouldn't happen for real student scans)
    if (currentScan.student_id === null) {
      logger.warn('Cannot submit feedback: student_id is null');
      setShowFeedbackPrompt(false);
      setDailyCheckoutState(prev => (prev ? { ...prev, showingFarewell: true } : null));
      setTimeout(() => {
        setDailyCheckoutState(null);
        hideScanModal();
      }, 2000);
      return;
    }

    const success = await submitDailyFeedback(currentScan.student_id, rating);

    if (success) {
      logger.info('Feedback submitted successfully', { rating });
      setShowFeedbackPrompt(false);

      // Show farewell message
      setDailyCheckoutState(prev => (prev ? { ...prev, showingFarewell: true } : null));

      // Close modal after 2 seconds
      setTimeout(() => {
        setDailyCheckoutState(null);
        hideScanModal();
      }, 2000);
    } else {
      // On error, still show farewell (don't block user from leaving)
      logger.warn('Feedback submission failed but continuing with checkout');
      setShowFeedbackPrompt(false);
      setDailyCheckoutState(prev => (prev ? { ...prev, showingFarewell: true } : null));

      setTimeout(() => {
        setDailyCheckoutState(null);
        hideScanModal();
      }, 2000);
    }
  };

  // Handle checkout destination selection (Schulhof or Raumwechsel)
  const handleDestinationSelect = async (destination: 'schulhof' | 'raumwechsel') => {
    if (!checkoutDestinationState || !authenticatedUser?.pin) return;

    if (destination === 'schulhof') {
      // Check if Schulhof room ID is available
      if (!schulhofRoomId) {
        logger.error('Cannot check into Schulhof: room ID not available');

        // Show error modal
        const errorResult: RfidScanResult = {
          student_name: 'Schulhof nicht verfügbar',
          student_id: checkoutDestinationState.studentId,
          action: 'error',
          message: `${checkoutDestinationState.studentName}: Schulhof-Raum wurde nicht konfiguriert.`,
          showAsError: true,
        };

        setScanResult(errorResult);
        setCheckoutDestinationState(null);
        showScanModal();

        setTimeout(() => {
          hideScanModal();
        }, rfid.modalDisplayTime);
        return;
      }

      try {
        logger.info('Checking student into Schulhof', {
          rfid: checkoutDestinationState.rfid,
          studentName: checkoutDestinationState.studentName,
          schulhofRoomId,
        });

        // CRITICAL: Wait for background checkout sync to complete
        // This prevents race condition where check-in happens before checkout
        const recentScan = recentTagScans.get(checkoutDestinationState.rfid);
        if (recentScan?.syncPromise) {
          logger.debug('Waiting for background checkout sync to complete');
          await recentScan.syncPromise;
          logger.debug('Background sync completed, proceeding with Schulhof check-in');
        }

        // Now safe to check into Schulhof
        const result = await api.processRfidScan(
          {
            student_rfid: checkoutDestinationState.rfid,
            action: 'checkin',
            room_id: schulhofRoomId,
          },
          authenticatedUser.pin
        );

        logger.info('Schulhof check-in successful', {
          action: result.action,
          room: result.room_name,
        });

        // Show special Schulhof success modal with custom message
        const firstName = checkoutDestinationState.studentName.split(' ')[0];
        const schulhofResult = {
          ...result,
          message: `Viel Spaß auf dem Schulhof, ${firstName}!`,
          isSchulhof: true, // Flag for special yellow styling
        } as RfidScanResult & { isSchulhof: boolean };

        setScanResult(schulhofResult);

        showScanModal();

        // Auto-close after display time
        setTimeout(() => {
          hideScanModal();
        }, rfid.modalDisplayTime);
      } catch (error) {
        logger.error('Failed to check into Schulhof', { error });

        // Map error to user-friendly German message with network detection
        const userFriendlyError = isNetworkRelatedError(error)
          ? 'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
          : mapServerErrorToGerman(
              error instanceof Error ? error.message : 'Schulhof Check-in fehlgeschlagen'
            );

        // Show error modal
        const errorResult: RfidScanResult = {
          student_name: 'Schulhof Check-in fehlgeschlagen',
          student_id: checkoutDestinationState.studentId,
          action: 'error',
          message: userFriendlyError,
          showAsError: true,
        };

        setScanResult(errorResult);

        showScanModal();

        setTimeout(() => {
          hideScanModal();
        }, rfid.modalDisplayTime);
      }
    }
    // else: destination === 'raumwechsel'
    // Do nothing - student will scan at destination room

    // Clear destination state
    setCheckoutDestinationState(null);
  };

  const shouldShowCheckModal =
    showModal && !!currentScan && !(currentScan.action === 'checked_out' && !dailyCheckoutState);

  return (
    <>
      <BackgroundWrapper>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
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
            onTouchStart={e => {
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
            }}
            onTouchEnd={e => {
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
              stroke="currentColor"
              strokeWidth="2.5"
            >
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
            <div
              style={{
                textAlign: 'center',
                marginTop: '40px',
                marginBottom: '20px',
              }}
            >
              <h1
                style={{
                  fontSize: '56px',
                  fontWeight: 700,
                  color: '#111827',
                  margin: 0,
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                flex: 1,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '220px',
                    fontWeight: 800,
                    color: '#83cd2d',
                    lineHeight: 1,
                    marginBottom: '0px',
                    marginTop: '-12px',
                  }}
                >
                  {studentCount ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BackgroundWrapper>

      {/**/}
      {/* Check-in/Check-out Modal */}
      {shouldShowCheckModal && currentScan && (
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
          onClick={() => {
            // Allow clicking backdrop to dismiss daily checkout modal (but NOT during feedback)
            if (dailyCheckoutState && !showFeedbackPrompt) {
              setDailyCheckoutState(null);
              hideScanModal();
            }
          }}
        >
          <div
            style={{
              backgroundColor: (() => {
                // Check for daily checkout state
                if (dailyCheckoutState) return '#6366f1'; // Blue for daily checkout
                // Check for Schulhof check-in (special yellow)
                if ((currentScan as { isSchulhof?: boolean }).isSchulhof) return '#F59E0B'; // Yellow for Schulhof
                // Check for supervisor authentication
                if (currentScan.action === 'supervisor_authenticated') return '#3B82F6'; // Blue for supervisor
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
            onClick={e => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            {/* Background pattern for visual interest */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
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
                // Daily checkout state - Question or Farewell icon
                if (dailyCheckoutState) {
                  // Home icon (outline) for daily checkout states
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  );
                }
                // Supervisor authentication icon
                if (currentScan.action === 'supervisor_authenticated') {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  );
                }
                // Error state - X icon
                if ((currentScan as { showAsError?: boolean }).showAsError) {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  );
                }
                // Info state - Info icon
                if ((currentScan as { isInfo?: boolean }).isInfo) {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  );
                }
                // Success states
                return currentScan.action === 'checked_in' ||
                  currentScan.action === 'transferred' ? (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
                // Feedback prompt
                if (showFeedbackPrompt) {
                  return 'Wie war dein Tag?';
                }

                // Daily checkout state
                if (dailyCheckoutState) {
                  if (dailyCheckoutState.showingFarewell) {
                    // Extract first name from full name
                    const firstName = dailyCheckoutState.studentName.split(' ')[0];
                    return `Auf Wiedersehen, ${firstName}!`;
                  } else {
                    return 'Gehst du nach Hause?';
                  }
                }

                // Supervisor authentication - prefer custom message (e.g., redirect hint)
                if (currentScan.action === 'supervisor_authenticated') {
                  if (currentScan.message) return currentScan.message;

                  const roomName = selectedRoom?.name ?? 'diesen Raum';
                  return `${currentScan.student_name} betreut jetzt ${roomName}`;
                }

                // Show custom message if available
                const msg = currentScan.message;
                if (msg) return msg;

                // Error/Info states use student_name as the title
                if (
                  (currentScan as { showAsError?: boolean }).showAsError ||
                  (currentScan as { isInfo?: boolean }).isInfo
                ) {
                  return currentScan.student_name;
                }

                // Normal greeting
                return currentScan.action === 'checked_in'
                  ? `Hallo, ${currentScan.student_name}!`
                  : `Tschüss, ${currentScan.student_name}!`;
              })()}
            </h2>

            {/* Content area for message or button */}
            {showFeedbackPrompt ? (
              // Feedback prompt UI - styled to match Check In/Check Out modals
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {/* Student name subtitle - matching other modal styles */}
                <div
                  style={{
                    fontSize: '28px',
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontWeight: 600,
                    marginBottom: '40px',
                  }}
                >
                  {dailyCheckoutState?.studentName}
                </div>

                {/* Feedback buttons container - centered with consistent spacing */}
                <div
                  style={{
                    display: 'flex',
                    gap: '24px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {feedbackButtons.map(({ rating, icon, label }) => (
                    <button
                      key={rating}
                      onClick={() => handleFeedbackSubmit(rating)}
                      style={FEEDBACK_BUTTON_STYLES.base}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor =
                          FEEDBACK_BUTTON_STYLES.hover.backgroundColor;
                        e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.hover.transform;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor =
                          FEEDBACK_BUTTON_STYLES.normal.backgroundColor;
                        e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.normal.transform;
                      }}
                    >
                      {/* Icon sized appropriately within button */}
                      <FontAwesomeIcon
                        icon={icon}
                        style={{
                          fontSize: '56px',
                          width: '64px',
                          height: '64px',
                        }}
                      />
                      <span style={{ fontSize: '20px', fontWeight: 700 }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : dailyCheckoutState ? (
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {!dailyCheckoutState.showingFarewell && (
                  <>
                    {/* Student name subtitle */}
                    <div
                      style={{
                        fontSize: '28px',
                        color: 'rgba(255, 255, 255, 0.95)',
                        fontWeight: 600,
                        marginBottom: '40px',
                      }}
                    >
                      {dailyCheckoutState.studentName}
                    </div>

                    {/* Button container for Yes/No options */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        alignItems: 'center',
                      }}
                    >
                      {/* Confirm button */}
                      <button
                        onClick={handleDailyCheckoutConfirm}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                          border: '3px solid rgba(255, 255, 255, 0.5)',
                          borderRadius: '20px',
                          color: '#FFFFFF',
                          fontSize: '32px',
                          fontWeight: 700,
                          padding: '20px 64px',
                          cursor: 'pointer',
                          transition: 'all 200ms',
                          outline: 'none',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        Ja, nach Hause
                      </button>

                      {/* Decline button */}
                      <button
                        onClick={() => {
                          setDailyCheckoutState(null);
                          hideScanModal();
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          border: '2px solid rgba(255, 255, 255, 0.4)',
                          borderRadius: '16px',
                          color: 'rgba(255, 255, 255, 0.9)',
                          fontSize: '24px',
                          fontWeight: 600,
                          padding: '12px 48px',
                          cursor: 'pointer',
                          transition: 'all 200ms',
                          outline: 'none',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                        }}
                      >
                        Nein
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
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
                  // Special handling for Schulhof - no additional content needed
                  if ((currentScan as { isSchulhof?: boolean }).isSchulhof) {
                    return ''; // Empty content - title message is enough
                  }

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
            )}
          </div>
        </div>
      )}

      {/* Checkout Destination Selection Modal */}
      {showModal &&
        currentScan?.action === 'checked_out' &&
        checkoutDestinationState &&
        !dailyCheckoutState && (
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
            onClick={() => {
              // Allow clicking backdrop to dismiss (same as timeout)
              setCheckoutDestinationState(null);
              hideScanModal();
            }}
          >
            <div
              style={{
                backgroundColor: '#f87C10', // Orange like checkout
                borderRadius: '32px',
                padding: '64px',
                maxWidth: '800px',
                width: '90%',
                textAlign: 'center',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
                position: 'relative',
              }}
              onClick={e => e.stopPropagation()} // Prevent closing when clicking inside
            >
              {/* Background gradient */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background:
                    'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
                  pointerEvents: 'none',
                  borderRadius: '32px',
                }}
              />

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
                Wohin gehst du?
              </h2>

              <p
                style={{
                  fontSize: '32px',
                  color: 'rgba(255, 255, 255, 0.95)',
                  marginBottom: '48px',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                {checkoutDestinationState.studentName}
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '24px',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                {[
                  { destination: 'raumwechsel' as const, label: 'Raumwechsel', condition: true },
                  {
                    destination: 'schulhof' as const,
                    label: 'Schulhof',
                    condition: Boolean(schulhofRoomId),
                  },
                ]
                  .filter(btn => btn.condition)
                  .map(({ destination, label }) => (
                    <button
                      key={destination}
                      onClick={() => handleDestinationSelect(destination)}
                      style={{
                        ...DESTINATION_BUTTON_STYLES.base,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        minWidth: '220px',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor =
                          DESTINATION_BUTTON_STYLES.hover.backgroundColor;
                        e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.hover.transform;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor =
                          DESTINATION_BUTTON_STYLES.normal.backgroundColor;
                        e.currentTarget.style.transform =
                          DESTINATION_BUTTON_STYLES.normal.transform;
                      }}
                    >
                      {destination === 'raumwechsel' ? (
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      ) : (
                        <FontAwesomeIcon
                          icon={faChildren}
                          style={{
                            fontSize: '48px',
                            color: '#FFFFFF',
                          }}
                        />
                      )}
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF' }}>
                        {label}
                      </span>
                    </button>
                  ))}
              </div>

              {!schulhofRoomId && (
                <p
                  style={{
                    marginTop: '16px',
                    fontSize: '18px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  (Schulhof derzeit nicht verfügbar)
                </p>
              )}
            </div>
          </div>
        )}
    </>
  );
};

export default ActivityScanningPage;
