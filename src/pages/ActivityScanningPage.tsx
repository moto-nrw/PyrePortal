import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import {
  ScanModal,
  getScanModalModel,
  type ScanModalCallbacks,
  type ScanModalState,
  type ExtendedScanResult,
} from '../components/modals/ScanModal';
import type { CloseReason } from '../components/ui/modal/types';
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

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedActivity, selectedRoom, authenticatedUser, currentSession, fetchCurrentSession } =
    useUserStore();

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

  // State consistency guard - detect and fix stale room state (Issue #129 Bug 1)
  useEffect(() => {
    if (currentSession?.room_id && selectedRoom && selectedRoom.id !== currentSession.room_id) {
      logger.warn('State inconsistency detected: selectedRoom does not match session', {
        selectedRoomId: selectedRoom.id,
        selectedRoomName: selectedRoom.name,
        sessionRoomId: currentSession.room_id,
        sessionRoomName: currentSession.room_name,
      });
      // Re-sync state from server to fix inconsistency
      void fetchCurrentSession();
    }
  }, [currentSession, selectedRoom, fetchCurrentSession]);

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

  // Clear stale modal state when a new scan arrives (Issue #129 Bug 2 defensive fix)
  // This prevents previous student's state from affecting the next scan's modal
  useEffect(() => {
    if (currentScan && dailyCheckoutState) {
      // Find the current scan's RFID from recent scans
      let currentRfid = '';
      for (const [tag, scan] of recentTagScans.entries()) {
        if (scan.result?.student_id === currentScan.student_id) {
          currentRfid = tag;
          break;
        }
      }

      // If dailyCheckoutState exists for a DIFFERENT scan, clear it
      if (currentRfid && dailyCheckoutState.rfid !== currentRfid) {
        logger.debug('Clearing stale dailyCheckoutState for new scan', {
          oldRfid: dailyCheckoutState.rfid,
          newRfid: currentRfid,
          oldStudentName: dailyCheckoutState.studentName,
          newStudentName: currentScan.student_name,
        });
        setDailyCheckoutState(null);
        setShowFeedbackPrompt(false);
      }
    }
  }, [currentScan, dailyCheckoutState, recentTagScans]);

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

    // Set up periodic updates every 10 seconds (for multi-kiosk sync)
    const interval = setInterval(() => {
      void fetchSessionInfo();
    }, 10000);

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
        } else if (currentScan.action === 'pending_daily_checkout') {
          // Handle pending daily checkout - find the RFID tag from recent scans
          // NOTE: No checkout has happened yet! Server is waiting for user confirmation.
          let rfidTag = '';

          // Look through recent tag scans to find the one for this student
          for (const [tag, scan] of recentTagScans.entries()) {
            if (scan.result?.student_id === currentScan.student_id) {
              rfidTag = tag;
              break;
            }
          }

          // Set up daily checkout state to show confirmation modal
          setDailyCheckoutState({
            rfid: rfidTag,
            studentName: currentScan.student_name,
            showingFarewell: false,
          });

          // DO NOT decrement student count here - checkout hasn't happened yet!
          // Count will be decremented after user confirms (Ja/Nein/timeout)
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

  // Handle scan modal close - cleanup state and dismiss modal
  // For pending_daily_checkout, timeout/backdrop = implicit "Nein" (room change)
  const handleScanModalClose = useCallback(
    (reason: CloseReason) => {
      logger.debug('Scan modal close triggered', {
        reason,
        hasDailyCheckout: !!dailyCheckoutState,
        hasDestinationState: !!checkoutDestinationState,
        showingFarewell: dailyCheckoutState?.showingFarewell,
        showFeedbackPrompt,
        navigateOnClose: (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose,
      });

      // Check if navigation is required after modal close
      const navigateTo = (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose;

      // If pending daily checkout and not showing farewell/feedback, treat timeout/backdrop as "Nein" (room change)
      // This sends the API call with destination='unterwegs'
      const shouldProcessAsRoomChange =
        (reason === 'timeout' || reason === 'backdrop') &&
        dailyCheckoutState &&
        !dailyCheckoutState.showingFarewell &&
        !showFeedbackPrompt &&
        authenticatedUser?.pin;

      if (shouldProcessAsRoomChange) {
        logger.info('Modal close on pending daily checkout - processing as room change', {
          reason,
          rfid: dailyCheckoutState.rfid,
          studentName: dailyCheckoutState.studentName,
        });

        // Fire-and-forget API call for room change (destination=unterwegs)
        void (async () => {
          try {
            await api.toggleAttendance(
              authenticatedUser.pin,
              dailyCheckoutState.rfid,
              'confirm_daily_checkout',
              'unterwegs'
            );
            logger.info('Room change successful via modal close');
            // Decrement count after successful API call
            setStudentCount(prev => Math.max(0, prev - 1));
          } catch (error) {
            logger.error('Failed to process room change from modal close', { error });
            // Silently fail - modal is already closing
          }
        })();
      }

      // Always clear daily checkout state
      if (dailyCheckoutState) {
        setDailyCheckoutState(null);
      }

      // Clean up checkout destination state
      if (checkoutDestinationState) {
        setCheckoutDestinationState(null);
      }

      // Clear feedback prompt state to prevent orphaned state (Issue #129 Bug 2 fix)
      if (showFeedbackPrompt) {
        setShowFeedbackPrompt(false);
      }

      hideScanModal();

      // Navigate after modal is closed if required
      if (navigateTo) {
        logger.info('Navigating after modal close', { navigateTo, reason });
        // Navigation is fire-and-forget - errors are logged but don't affect modal flow
        const result = navigate(navigateTo);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            logger.error('Navigation failed after modal close', { navigateTo, error: err });
          });
        }
      }
    },
    [
      dailyCheckoutState,
      checkoutDestinationState,
      showFeedbackPrompt,
      hideScanModal,
      currentScan,
      navigate,
      authenticatedUser?.pin,
    ]
  );

  // Handle daily checkout confirmation - user clicked "Ja, nach Hause"
  const handleDailyCheckoutConfirm = useCallback(async () => {
    if (!dailyCheckoutState || !authenticatedUser?.pin) return;

    try {
      logger.info('Processing daily checkout with destination=zuhause', {
        rfid: dailyCheckoutState.rfid,
        studentName: dailyCheckoutState.studentName,
      });

      await api.toggleAttendance(
        authenticatedUser.pin,
        dailyCheckoutState.rfid,
        'confirm_daily_checkout',
        'zuhause'
      );

      logger.info('Daily checkout successful - student going home');
      setStudentCount(prev => Math.max(0, prev - 1));
      setShowFeedbackPrompt(true);
    } catch (error) {
      logger.error('Failed to process daily checkout', { error });

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
    }
  }, [dailyCheckoutState, authenticatedUser?.pin, setScanResult, showScanModal]);

  // Handle daily checkout decline - user clicked "Nein" (wants room change)
  const handleDailyCheckoutDecline = useCallback(async () => {
    if (!dailyCheckoutState || !authenticatedUser?.pin) return;

    try {
      logger.info('Processing daily checkout decline with destination=unterwegs', {
        rfid: dailyCheckoutState.rfid,
        studentName: dailyCheckoutState.studentName,
      });

      await api.toggleAttendance(
        authenticatedUser.pin,
        dailyCheckoutState.rfid,
        'confirm_daily_checkout',
        'unterwegs'
      );

      logger.info('Room change checkout successful - student changing rooms');
      setStudentCount(prev => Math.max(0, prev - 1));
      setDailyCheckoutState(null);
      hideScanModal();
    } catch (error) {
      logger.error('Failed to process room change checkout', { error });

      const errorMessage = error instanceof Error ? error.message : 'Raumwechsel fehlgeschlagen';
      const userFriendlyError = isNetworkRelatedError(error)
        ? 'Netzwerkfehler beim Raumwechsel. Bitte Verbindung prüfen und erneut versuchen.'
        : mapServerErrorToGerman(errorMessage);

      const errorResult: RfidScanResult = {
        student_name: 'Raumwechsel fehlgeschlagen',
        student_id: null,
        action: 'error',
        message: `${dailyCheckoutState.studentName}: ${userFriendlyError}`,
        showAsError: true,
      };

      setScanResult(errorResult);
      setDailyCheckoutState(null);
      showScanModal();
    }
  }, [dailyCheckoutState, authenticatedUser?.pin, hideScanModal, setScanResult, showScanModal]);

  // Handle feedback submission
  const handleFeedbackSubmit = useCallback(
    async (rating: DailyFeedbackRating) => {
      if (!dailyCheckoutState || !currentScan) return;

      const { submitDailyFeedback } = useUserStore.getState();

      logger.info('Submitting feedback', {
        studentId: currentScan.student_id,
        rating,
      });

      if (currentScan.student_id === null) {
        logger.warn('Cannot submit feedback: student_id is null');
        setShowFeedbackPrompt(false);
        setDailyCheckoutState(prev => (prev ? { ...prev, showingFarewell: true } : null));
        return;
      }

      const success = await submitDailyFeedback(currentScan.student_id, rating);

      if (success) {
        logger.info('Feedback submitted successfully', { rating });
      } else {
        logger.warn('Feedback submission failed but continuing with checkout');
      }

      setShowFeedbackPrompt(false);
      setDailyCheckoutState(prev => (prev ? { ...prev, showingFarewell: true } : null));
    },
    [dailyCheckoutState, currentScan]
  );

  // Handle checkout destination selection (Schulhof or Raumwechsel)
  const handleDestinationSelect = useCallback(
    async (destination: 'schulhof' | 'raumwechsel') => {
      if (!checkoutDestinationState || !authenticatedUser?.pin) return;

      if (destination === 'schulhof') {
        if (!schulhofRoomId) {
          logger.error('Cannot check into Schulhof: room ID not available');

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
          return;
        }

        try {
          logger.info('Checking student into Schulhof', {
            rfid: checkoutDestinationState.rfid,
            studentName: checkoutDestinationState.studentName,
            schulhofRoomId,
          });

          const recentScan = recentTagScans.get(checkoutDestinationState.rfid);
          if (recentScan?.syncPromise) {
            logger.debug('Waiting for background checkout sync to complete');
            await recentScan.syncPromise;
            logger.debug('Background sync completed, proceeding with Schulhof check-in');
          }

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

          const firstName = checkoutDestinationState.studentName.split(' ')[0];
          const schulhofResult = {
            ...result,
            message: `Viel Spaß auf dem Schulhof, ${firstName}!`,
            isSchulhof: true,
          } as RfidScanResult & { isSchulhof: boolean };

          setScanResult(schulhofResult);
          setCheckoutDestinationState(null);
          showScanModal();
        } catch (error) {
          logger.error('Failed to check into Schulhof', { error });

          const userFriendlyError = isNetworkRelatedError(error)
            ? 'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
            : mapServerErrorToGerman(
                error instanceof Error ? error.message : 'Schulhof Check-in fehlgeschlagen'
              );

          const errorResult: RfidScanResult = {
            student_name: 'Schulhof Check-in fehlgeschlagen',
            student_id: checkoutDestinationState.studentId,
            action: 'error',
            message: userFriendlyError,
            showAsError: true,
          };

          setScanResult(errorResult);
          setCheckoutDestinationState(null);
          showScanModal();
        }
      }
      // else: destination === 'raumwechsel'
      setCheckoutDestinationState(null);
    },
    [
      checkoutDestinationState,
      authenticatedUser?.pin,
      schulhofRoomId,
      recentTagScans,
      setScanResult,
      showScanModal,
    ]
  );

  // ScanModal callbacks for user interactions
  const scanModalCallbacks: ScanModalCallbacks = useMemo(
    () => ({
      onDailyCheckoutConfirm: handleDailyCheckoutConfirm,
      onDailyCheckoutDecline: handleDailyCheckoutDecline,
      onFeedbackSubmit: handleFeedbackSubmit,
      onDestinationSelect: handleDestinationSelect,
      isSchulhofAvailable: Boolean(schulhofRoomId),
    }),
    [
      handleDailyCheckoutConfirm,
      handleDailyCheckoutDecline,
      handleFeedbackSubmit,
      handleDestinationSelect,
      schulhofRoomId,
    ]
  );

  // ScanModal state for model generation
  const scanModalState: ScanModalState = useMemo(
    () => ({
      currentScan: currentScan as ExtendedScanResult | null,
      dailyCheckoutState,
      checkoutDestinationState,
      showFeedbackPrompt,
      roomName: selectedRoom?.name,
    }),
    [
      currentScan,
      dailyCheckoutState,
      checkoutDestinationState,
      showFeedbackPrompt,
      selectedRoom?.name,
    ]
  );

  // Generate modal model from current state
  const scanModalModel = useMemo(
    () => getScanModalModel(scanModalState, scanModalCallbacks),
    [scanModalState, scanModalCallbacks]
  );

  // Timer reset key - changes when modal state transitions (triggers timer restart)
  const timerResetKey = useMemo(
    () =>
      currentScan
        ? `${currentScan.student_id}-${scanModalModel?.variant ?? 'none'}-${dailyCheckoutState?.showingFarewell ?? false}`
        : 'none',
    [currentScan, scanModalModel?.variant, dailyCheckoutState?.showingFarewell]
  );

  const shouldShowCheckModal = showModal && !!currentScan;

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

      {/* Check-in/Check-out Modal - Model-driven ScanModal component */}
      <ScanModal
        model={scanModalModel}
        isOpen={shouldShowCheckModal}
        onClose={handleScanModalClose}
        callbacks={scanModalCallbacks}
        timerResetKey={timerResetKey}
      />
    </>
  );
};

export default ActivityScanningPage;
