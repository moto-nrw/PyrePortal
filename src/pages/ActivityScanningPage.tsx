import {
  faFaceSmile,
  faFaceMeh,
  faFaceFrown,
  faChildren,
  faRestroom,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import RfidProcessingIndicator from '../components/ui/RfidProcessingIndicator';
import { ScannerRestartButton } from '../components/ui/ScannerRestartButton';
import { useRfidScanning } from '../hooks/useRfidScanning';
import {
  api,
  formatRoomName,
  mapServerErrorToGerman,
  type RfidScanResult,
  type DailyFeedbackRating,
} from '../services/api';
import { useUserStore, isNetworkRelatedError } from '../store/userStore';
import { createLogger, serializeError } from '../utils/logger';

const logger = createLogger('ActivityScanningPage');

/**
 * Timeout duration (in milliseconds) for daily checkout/destination modals.
 * 7 seconds provides a quick flow while still giving students time to respond.
 */
const DAILY_CHECKOUT_TIMEOUT_MS = 7000;

/**
 * Timeout duration (in milliseconds) for farewell messages after actions.
 * 2 seconds is enough to read a short goodbye message.
 */
const FAREWELL_TIMEOUT_MS = 2000;

// Feedback button color schemes: green (positive), yellow (neutral), red (negative)
const FEEDBACK_BUTTON_COLORS = {
  positive: {
    background: 'rgba(16, 185, 129, 0.3)', // Green with transparency
    border: 'rgba(16, 185, 129, 0.7)',
    hoverBackground: 'rgba(16, 185, 129, 0.5)',
  },
  neutral: {
    background: 'rgba(245, 158, 11, 0.3)', // Yellow/amber with transparency
    border: 'rgba(245, 158, 11, 0.7)',
    hoverBackground: 'rgba(245, 158, 11, 0.5)',
  },
  negative: {
    background: 'rgba(239, 68, 68, 0.3)', // Red with transparency
    border: 'rgba(239, 68, 68, 0.7)',
    hoverBackground: 'rgba(239, 68, 68, 0.5)',
  },
} as const;

// Button style constants for consistent styling (matching Check In/Check Out modal patterns)
const FEEDBACK_BUTTON_STYLES = {
  base: {
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
    borderWidth: '3px',
    borderStyle: 'solid' as const,
  },
  hover: {
    transform: 'scale(1.05)',
  },
  normal: {
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

// =============================================================================
// Helper types and functions for scan action handling (extracted to reduce
// cognitive complexity of the student count useEffect - SonarCloud S3776)
// =============================================================================

/** Extended scan result type with optional flags */
interface ExtendedScanResult extends RfidScanResult {
  showAsError?: boolean;
  isInfo?: boolean;
  isSchulhof?: boolean;
  isToilette?: boolean;
}

/** State for checkout destination modal (unified checkout + "nach Hause" flow) */
interface CheckoutDestinationState {
  rfid: string;
  studentName: string;
  studentId: number | null;
  dailyCheckoutAvailable: boolean;
  showingFarewell: boolean;
}

/**
 * Handles check-in action and returns count delta.
 * Schulhof check-ins don't increment (student is leaving, not entering).
 */
const handleCheckinAction = (scan: ExtendedScanResult): number => {
  if (scan.isSchulhof || scan.isToilette) {
    return 0; // No change for Schulhof/WC check-in
  }
  return 1; // Increment count
};

/**
 * Handles check-out action: sets up destination modal state and returns count delta.
 * Uses scan.scannedTagId directly instead of looking up from recentTagScans (fixes race condition).
 */
const handleCheckoutAction = (
  scan: RfidScanResult,
  setCheckoutDestinationState: (state: CheckoutDestinationState) => void
): number => {
  setCheckoutDestinationState({
    rfid: scan.scannedTagId ?? '',
    studentName: scan.student_name,
    studentId: scan.student_id,
    dailyCheckoutAvailable: scan.daily_checkout_available ?? false,
    showingFarewell: false,
  });
  return -1; // Decrement count
};

/**
 * Handles transfer action: returns count delta based on room direction.
 * +1 if incoming to our room, -1 if outgoing from our room.
 */
const handleTransferAction = (
  scan: RfidScanResult,
  currentRoomName: string | undefined
): number => {
  if (scan.room_name === currentRoomName) {
    return 1; // Student transferred TO our room
  }
  if (scan.previous_room === currentRoomName) {
    return -1; // Student transferred FROM our room
  }
  return 0; // Not related to our room
};

/**
 * Checks if a scan result represents an error or info state.
 */
const isNonActionableScan = (scan: ExtendedScanResult): boolean => {
  return Boolean(scan.showAsError) || Boolean(scan.isInfo);
};

// =============================================================================
// End helper functions
// =============================================================================

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedActivity,
    selectedRoom,
    authenticatedUser,
    rfid,
    currentSession,
    fetchCurrentSession,
  } = useUserStore();

  const { currentScan, showModal, startScanning, stopScanning } = useRfidScanning();

  // Get access to the store's RFID functions
  const { recentTagScans } = useUserStore(state => state.rfid);
  const { hideScanModal, setScanResult, showScanModal } = useUserStore();

  // Debug logging for selectedActivity
  useEffect(() => {
    if (selectedActivity) {
      logger.debug('Selected activity data', {
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
      logger.debug('Modal should be showing', {
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
      });
    }
  }, [showModal, currentScan]);

  // State consistency guard - detect and fix stale room state (Issue #129 Bug 1)
  // Skips during recent manual room transitions to avoid ping-pong with stale server data.
  // Schedules a deferred re-check so the guard runs once the transition window elapses.
  useEffect(() => {
    const roomSelectedAt = useUserStore.getState()._roomSelectedAt;
    const remainingMs = roomSelectedAt != null ? 5000 - (Date.now() - roomSelectedAt) : 0;
    const isRecentTransition = remainingMs > 0;

    if (isRecentTransition) {
      logger.debug(
        'Skipping room mismatch check during recent room transition, re-checking after window'
      );
      const timeout = setTimeout(() => {
        const state = useUserStore.getState();
        if (
          state.currentSession?.room_id &&
          state.selectedRoom &&
          state.selectedRoom.id !== state.currentSession.room_id
        ) {
          logger.warn(
            'Deferred state inconsistency detected: selectedRoom does not match session',
            {
              selectedRoomId: state.selectedRoom.id,
              sessionRoomId: state.currentSession.room_id,
            }
          );
          void fetchCurrentSession();
        }
      }, remainingMs + 100); // small buffer past the 5s window
      return () => clearTimeout(timeout);
    }

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

  // State for checkout destination selection (unified: Raumwechsel, Schulhof, nach Hause)
  const [checkoutDestinationState, setCheckoutDestinationState] =
    useState<CheckoutDestinationState | null>(null);

  // Feedback prompt state
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);

  // Schulhof room ID (discovered dynamically from server)
  const [schulhofRoomId, setSchulhofRoomId] = useState<number | null>(null);

  // WC room ID (discovered dynamically from server)
  const [wcRoomId, setWcRoomId] = useState<number | null>(null);

  // Clear stale modal state when a new scan arrives (Issue #129 Bug 2 defensive fix)
  // This prevents previous student's state from affecting the next scan's modal
  useEffect(() => {
    if (currentScan && checkoutDestinationState) {
      const currentRfid = currentScan.scannedTagId ?? '';

      // If checkoutDestinationState exists for a DIFFERENT scan, clear it
      if (currentRfid && checkoutDestinationState.rfid !== currentRfid) {
        logger.debug('Clearing stale checkoutDestinationState for new scan', {
          oldRfid: checkoutDestinationState.rfid,
          newRfid: currentRfid,
          oldStudentName: checkoutDestinationState.studentName,
          newStudentName: currentScan.student_name,
        });
        setCheckoutDestinationState(null);
        setShowFeedbackPrompt(false);
      }
    }
  }, [currentScan, checkoutDestinationState]);

  // Start scanning when component mounts
  useEffect(() => {
    const initializeScanning = async () => {
      await startScanning();
    };

    void initializeScanning();

    // Cleanup: stop scanning when component unmounts
    return () => {
      void stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Function to fetch current session info
  const fetchSessionInfo = async () => {
    if (!authenticatedUser?.pin) return;

    try {
      const sessionInfo = await api.getCurrentSessionInfo(authenticatedUser.pin);
      logger.debug('Session info received', sessionInfo ?? {});

      if (sessionInfo) {
        const count = sessionInfo.active_students ?? 0;
        logger.info('Setting student count', { count });
        setStudentCount(count);
      } else {
        logger.warn('No session info received');
        setStudentCount(0);
      }
    } catch (error) {
      logger.error('Failed to fetch session info', { error: serializeError(error) });
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

        // Find WC room by name
        const wcRoom = rooms.find(r => r.name === 'WC');
        if (wcRoom) {
          setWcRoomId(wcRoom.id);
          logger.info('Found WC room', { id: wcRoom.id, name: wcRoom.name });
        } else {
          logger.warn('No WC room found - Toilette button will not work');
        }
      } catch (error) {
        logger.error('Failed to fetch Schulhof room', { error: serializeError(error) });
        // Non-critical error - continue without Schulhof functionality
      }
    };

    void fetchSchulhofRoom();
  }, [authenticatedUser?.pin]);

  // Update student count based on scan result
  // Refactored to use extracted helper functions (SonarCloud S3776 fix)
  useEffect(() => {
    if (!currentScan || !showModal) return;

    logger.debug('Updating student count based on scan', {
      action: currentScan.action,
      currentCount: studentCount,
    });

    // Skip error and info scans - they don't affect count
    const extendedScan = currentScan as ExtendedScanResult;
    if (isNonActionableScan(extendedScan)) return;

    // Use authoritative server count when available, otherwise fall back to optimistic delta
    const hasAuthoritativeCount = currentScan.active_students != null;

    // Run action-specific side effects (e.g. checkout destination state) regardless of count source
    switch (currentScan.action) {
      case 'checked_in':
        // Legacy: optimistic delta fallback for servers that don't provide active_students
        if (!hasAuthoritativeCount) {
          const delta = handleCheckinAction(extendedScan);
          if (delta !== 0) setStudentCount(prev => Math.max(0, prev + delta));
        }
        break;
      case 'checked_out': {
        const delta = handleCheckoutAction(currentScan, setCheckoutDestinationState);
        // Legacy: optimistic delta fallback for servers that don't provide active_students
        if (!hasAuthoritativeCount && delta !== 0)
          setStudentCount(prev => Math.max(0, prev + delta));
        break;
      }
      case 'transferred':
        // Legacy: optimistic delta fallback for servers that don't provide active_students
        if (!hasAuthoritativeCount) {
          const delta = handleTransferAction(currentScan, selectedRoom?.name);
          if (delta !== 0) setStudentCount(prev => Math.max(0, prev + delta));
        }
        break;
    }

    // Apply authoritative count after side effects
    // Skip for Schulhof scans: active_students refers to the Schulhof room, not our room
    if (hasAuthoritativeCount && !extendedScan.isSchulhof && !extendedScan.isToilette) {
      setStudentCount(currentScan.active_students!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScan, showModal]); // Only update when scan modal shows

  // Determine modal timeout duration based on current state
  const modalTimeoutDuration = useMemo(() => {
    // Farewell messages use shorter timeout (just showing goodbye)
    if (checkoutDestinationState?.showingFarewell) {
      return FAREWELL_TIMEOUT_MS;
    }
    // Checkout destination states (buttons, feedback) use longer timeout
    if (checkoutDestinationState || showFeedbackPrompt) {
      return DAILY_CHECKOUT_TIMEOUT_MS;
    }
    // Normal scans use configured display time
    return rfid.modalDisplayTime;
  }, [checkoutDestinationState, showFeedbackPrompt, rfid.modalDisplayTime]);

  // Handle modal timeout - cleanup state and dismiss modal
  // Student is already checked out by the server, so timeout just closes the modal
  const handleModalTimeout = useCallback(() => {
    logger.debug('Modal timeout triggered', {
      hasDestinationState: !!checkoutDestinationState,
      showingFarewell: checkoutDestinationState?.showingFarewell,
      showFeedbackPrompt,
      navigateOnClose: (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose,
    });

    // Check if navigation is required after modal close
    const navigateTo = (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose;

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
      logger.info('Navigating after modal timeout', { navigateTo });
      const result = navigate(navigateTo);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          logger.error('Navigation failed after modal timeout', { navigateTo, error: err });
        });
      }
    }
  }, [checkoutDestinationState, showFeedbackPrompt, hideScanModal, currentScan, navigate]);

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

  // Handle "nach Hause" button - student confirmed going home
  // Call confirm_daily_checkout to finalize attendance, then show feedback prompt
  const handleNachHause = async () => {
    if (!checkoutDestinationState || !authenticatedUser?.pin) return;

    logger.info('Student confirmed nach Hause - calling confirm_daily_checkout', {
      rfid: checkoutDestinationState.rfid,
      studentName: checkoutDestinationState.studentName,
    });

    try {
      await api.toggleAttendance(
        authenticatedUser.pin,
        checkoutDestinationState.rfid,
        'confirm_daily_checkout',
        'zuhause'
      );
      logger.info('Daily checkout confirmed, showing feedback prompt');
      setShowFeedbackPrompt(true);
    } catch (error) {
      logger.error('Failed to confirm daily checkout', {
        rfid: checkoutDestinationState.rfid,
        error: error instanceof Error ? error.message : String(error),
      });
      // Still show feedback prompt — the visit is already ended,
      // attendance sync failure shouldn't block the student
      setShowFeedbackPrompt(true);
    }
  };

  // Handle feedback submission
  const handleFeedbackSubmit = async (rating: DailyFeedbackRating) => {
    if (!checkoutDestinationState || !currentScan) return;

    const { submitDailyFeedback } = useUserStore.getState();

    logger.info('Submitting feedback', {
      studentId: currentScan.student_id,
      rating,
    });

    // Guard against null student_id (shouldn't happen for real student scans)
    if (currentScan.student_id === null) {
      logger.warn('Cannot submit feedback: student_id is null');
      setShowFeedbackPrompt(false);
      // Show farewell - useModalTimeout will auto-close with FAREWELL_TIMEOUT_MS
      setCheckoutDestinationState(prev => (prev ? { ...prev, showingFarewell: true } : null));
      return;
    }

    const success = await submitDailyFeedback(currentScan.student_id, rating);

    if (success) {
      logger.info('Feedback submitted successfully', { rating });
    } else {
      // On error, still show farewell (don't block user from leaving)
      logger.warn('Feedback submission failed but continuing with checkout');
    }

    // Show farewell message - useModalTimeout will auto-close with FAREWELL_TIMEOUT_MS
    setShowFeedbackPrompt(false);
    setCheckoutDestinationState(prev => (prev ? { ...prev, showingFarewell: true } : null));
  };

  // Handle checkout destination selection (Schulhof or Raumwechsel)
  const handleDestinationSelect = async (destination: 'schulhof' | 'raumwechsel' | 'toilette') => {
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
        // Modal will auto-close via useModalTimeout hook
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
        setCheckoutDestinationState(null);
        showScanModal();
        // Modal will auto-close via useModalTimeout hook
      } catch (error) {
        logger.error('Failed to check into Schulhof', { error: serializeError(error) });

        // Map error to user-friendly German message with network detection
        const errorMessage =
          error instanceof Error ? error.message : 'Schulhof Check-in fehlgeschlagen';
        const userFriendlyError = isNetworkRelatedError(error)
          ? 'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
          : mapServerErrorToGerman(errorMessage);

        // Show error modal
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
        // Modal will auto-close via useModalTimeout hook
      }
    }

    if (destination === 'toilette') {
      // Check if WC room ID is available
      if (!wcRoomId) {
        logger.error('Cannot check into WC: room ID not available');

        const errorResult: RfidScanResult = {
          student_name: 'Toilette nicht verfügbar',
          student_id: checkoutDestinationState.studentId,
          action: 'error',
          message: `${checkoutDestinationState.studentName}: Toilette-Raum wurde nicht konfiguriert.`,
          showAsError: true,
        };

        setScanResult(errorResult);
        setCheckoutDestinationState(null);
        showScanModal();
        return;
      }

      try {
        logger.info('Checking student into WC', {
          rfid: checkoutDestinationState.rfid,
          studentName: checkoutDestinationState.studentName,
          wcRoomId,
        });

        // CRITICAL: Wait for background checkout sync to complete
        const recentScan = recentTagScans.get(checkoutDestinationState.rfid);
        if (recentScan?.syncPromise) {
          logger.debug('Waiting for background checkout sync to complete');
          await recentScan.syncPromise;
          logger.debug('Background sync completed, proceeding with WC check-in');
        }

        const result = await api.processRfidScan(
          {
            student_rfid: checkoutDestinationState.rfid,
            action: 'checkin',
            room_id: wcRoomId,
          },
          authenticatedUser.pin
        );

        logger.info('WC check-in successful', {
          action: result.action,
          room: result.room_name,
        });

        const firstName = checkoutDestinationState.studentName.split(' ')[0];
        const wcResult = {
          ...result,
          message: `Bis gleich, ${firstName}!`,
          isToilette: true,
        } as RfidScanResult & { isToilette: boolean };

        setScanResult(wcResult);
        setCheckoutDestinationState(null);
        showScanModal();
      } catch (error) {
        logger.error('Failed to check into WC', { error: serializeError(error) });

        const errorMessage =
          error instanceof Error ? error.message : 'Toilette Check-in fehlgeschlagen';
        const userFriendlyError = isNetworkRelatedError(error)
          ? 'Netzwerkfehler bei Toilette-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
          : mapServerErrorToGerman(errorMessage);

        const errorResult: RfidScanResult = {
          student_name: 'Toilette Check-in fehlgeschlagen',
          student_id: checkoutDestinationState.studentId,
          action: 'error',
          message: userFriendlyError,
          showAsError: true,
        };

        setScanResult(errorResult);
        setCheckoutDestinationState(null);
        showScanModal();
      }

      return;
    }

    // destination === 'raumwechsel'
    // Clear destination state - student will scan at destination room
    setCheckoutDestinationState(null);
  };

  // Helper function to render modal content area - extracted to avoid nested ternaries
  const renderModalContent = () => {
    if (!currentScan) return null;

    // Feedback prompt UI - styled to match Check In/Check Out modals
    if (showFeedbackPrompt) {
      return (
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
            {checkoutDestinationState?.studentName}
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
            {feedbackButtons.map(({ rating, icon, label }) => {
              const colorScheme = FEEDBACK_BUTTON_COLORS[rating];
              return (
                <button
                  key={rating}
                  onClick={() => handleFeedbackSubmit(rating)}
                  style={{
                    ...FEEDBACK_BUTTON_STYLES.base,
                    backgroundColor: colorScheme.background,
                    borderColor: colorScheme.border,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = colorScheme.hoverBackground;
                    e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.hover.transform;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = colorScheme.background;
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
              );
            })}
          </div>
        </div>
      );
    }

    // Unified checkout destination selection (Raumwechsel, Schulhof, nach Hause)
    if (
      currentScan.action === 'checked_out' &&
      checkoutDestinationState &&
      !checkoutDestinationState.showingFarewell
    ) {
      return (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Row 1: Raumwechsel + Schulhof */}
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
              {
                destination: 'toilette' as const,
                label: 'Toilette',
                condition: Boolean(wcRoomId),
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
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor =
                      DESTINATION_BUTTON_STYLES.hover.backgroundColor;
                    e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.hover.transform;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor =
                      DESTINATION_BUTTON_STYLES.normal.backgroundColor;
                    e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.normal.transform;
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
                  ) : destination === 'schulhof' ? (
                    <FontAwesomeIcon
                      icon={faChildren}
                      style={{
                        fontSize: '48px',
                        color: '#FFFFFF',
                      }}
                    />
                  ) : (
                    <FontAwesomeIcon
                      icon={faRestroom}
                      style={{ fontSize: '48px', color: '#FFFFFF' }}
                    />
                  )}
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF' }}>
                    {label}
                  </span>
                </button>
              ))}
          </div>

          {/* Row 2: "nach Hause" button or hint text */}
          {checkoutDestinationState.dailyCheckoutAvailable ? (
            <button
              onClick={handleNachHause}
              style={{
                ...DESTINATION_BUTTON_STYLES.base,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                width: '100%',
                marginTop: '16px',
                padding: '16px 48px',
                position: 'relative',
                zIndex: 2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor =
                  DESTINATION_BUTTON_STYLES.hover.backgroundColor;
                e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.hover.transform;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor =
                  DESTINATION_BUTTON_STYLES.normal.backgroundColor;
                e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.normal.transform;
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF' }}>
                nach Hause
              </span>
            </button>
          ) : (
            <p
              style={{
                marginTop: '16px',
                fontSize: '22px',
                color: 'rgba(255, 255, 255, 0.6)',
                position: 'relative',
                zIndex: 2,
                fontStyle: 'italic',
              }}
            >
              „nach Hause" nur vom Heimatraum möglich
            </p>
          )}

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
      );
    }

    // Default message content
    return (
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
          // Special handling for Schulhof/Toilette - no additional content needed
          if ((currentScan as { isSchulhof?: boolean }).isSchulhof) {
            return ''; // Empty content - title message is enough
          }
          if ((currentScan as { isToilette?: boolean }).isToilette) {
            return ''; // Empty content - title message is enough
          }

          switch (currentScan.action) {
            case 'checked_in':
              return `Du bist jetzt in ${currentScan.room_name ? formatRoomName(currentScan.room_name) : 'diesem Raum'}`;
            case 'checked_out':
              return ''; // Checkout shows destination buttons, no extra text needed
            case 'transferred':
              return 'Raumwechsel erfolgreich';
            default:
              return '';
          }
        })()}
      </div>
    );
  };

  const shouldShowCheckModal = showModal && !!currentScan;

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
          {/* Anmelden Button - Top Right */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 10,
            }}
          >
            <BackButton
              onClick={handleAnmelden}
              text="Anmelden"
              customIcon={
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#374151"
                  strokeWidth="2.5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              ariaLabel="Anmelden - zur PIN-Eingabe"
            />
          </div>

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

      {/* Check-in/Check-out Modal */}
      {currentScan && (
        <ModalBase
          isOpen={shouldShowCheckModal}
          onClose={handleModalTimeout}
          size={
            currentScan.action === 'checked_out' &&
            checkoutDestinationState &&
            !checkoutDestinationState.showingFarewell
              ? 'xl'
              : 'lg'
          }
          backgroundColor={(() => {
            // "nach Hause" flow states (farewell, feedback) use blue
            if (checkoutDestinationState?.showingFarewell || showFeedbackPrompt) return '#6366f1';
            // Check for Schulhof check-in (special yellow)
            if ((currentScan as { isSchulhof?: boolean }).isSchulhof) return '#F59E0B'; // Yellow for Schulhof
            if ((currentScan as { isToilette?: boolean }).isToilette) return '#60A5FA'; // Blue for Toilette
            // Check for supervisor authentication
            if (currentScan.action === 'supervisor_authenticated') return '#3B82F6'; // Blue for supervisor
            // Check for error or info states
            if ((currentScan as { showAsError?: boolean }).showAsError) return '#ef4444'; // Red for errors
            if ((currentScan as { isInfo?: boolean }).isInfo) return '#6366f1'; // Blue for info
            // Original logic for success states
            return currentScan.action === 'checked_in' || currentScan.action === 'transferred'
              ? '#83cd2d'
              : '#f87C10';
          })()}
          timeout={modalTimeoutDuration}
          timeoutResetKey={`${currentScan.student_id}-${currentScan.action}-${checkoutDestinationState?.showingFarewell ?? false}-${showFeedbackPrompt}`}
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
              // "nach Hause" flow - Home icon for farewell and feedback states
              if (checkoutDestinationState?.showingFarewell || showFeedbackPrompt) {
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
              return currentScan.action === 'checked_in' || currentScan.action === 'transferred' ? (
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

              // Farewell state after "nach Hause" feedback
              if (checkoutDestinationState?.showingFarewell) {
                const firstName = checkoutDestinationState.studentName.split(' ')[0];
                return `Tschüss, ${firstName}!`;
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
              if (currentScan.action === 'checked_in') {
                return `Hallo, ${currentScan.student_name}!`;
              }
              // Checkout: ask where the student is going
              return `Wohin geht ${currentScan.student_name}?`;
            })()}
          </h2>

          {/* Content area for message or button */}
          {renderModalContent()}
        </ModalBase>
      )}

      <ScannerRestartButton
        onBeforeRecover={() => stopScanning()}
        onAfterRecover={() => startScanning()}
      />

      {/* Bottom-left spinner: visible between RFID tag detection and API response */}
      <RfidProcessingIndicator isVisible={rfid.processingQueue.size > 0} />
    </>
  );
};

export default ActivityScanningPage;
