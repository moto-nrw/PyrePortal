import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  createPickupQueryTimeoutResult,
  getCheckinCountDelta,
  getCheckoutCountDelta,
  getModalTimeoutDuration,
  getTransferCountDelta,
  isNonActionableScan,
  shouldApplyAuthoritativeCount,
  type ExtendedScanResult,
} from '../../services/activityScanningRules';
import {
  api,
  WC_ROOM_ALIASES,
  type DailyFeedbackRating,
  type DeviceConfig,
  type Room,
} from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { createLogger, serializeError } from '../../utils/logger';
import { useRfidScanning } from '../useRfidScanning';

import { useCheckoutDestination } from './useCheckoutDestination';

const logger = createLogger('ActivityScanningPage');

/**
 * Returns the first room whose name matches one of the given aliases.
 * Aliases are tried in order, so callers can pass a canonical-first list.
 */
const findRoomByAliases = (rooms: Room[], aliases: readonly string[]): Room | undefined => {
  for (const alias of aliases) {
    const match = rooms.find(r => r.name === alias);
    if (match) return match;
  }
  return undefined;
};

/**
 * View model for the activity scanning page.
 *
 * Owns polling, the on-mount fetches (Schulhof room, WC room, device config),
 * the student count rules, the checkout destination and feedback flows and
 * the modal wiring. The page component consumes this hook and renders JSX only.
 */
export function useActivityScanningPage() {
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

  const {
    hideScanModal,
    removeFromProcessingQueue,
    resetScanMode,
    setScanResult,
    showScanModal,
    startPickupQueryMode,
  } = useUserStore();

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

  // Schulhof room ID (discovered dynamically from server)
  const [schulhofRoomId, setSchulhofRoomId] = useState<number | null>(null);

  // WC room ID (discovered dynamically from server)
  const [wcRoomId, setWcRoomId] = useState<number | null>(null);

  // Checkout destination flow (unified: Raumwechsel, Schulhof, nach Hause)
  const { checkoutDestinationState, setCheckoutDestinationState, handleDestinationSelect } =
    useCheckoutDestination({ schulhofRoomId, wcRoomId });

  // Feedback prompt state
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);

  // Track which visit started the feedback prompt so we can detect new scans
  const feedbackVisitIdRef = useRef<number | null>(null);

  // Device config (checkout button visibility, fetched once on mount)
  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig | null>(null);

  // Compute how many destination buttons will be visible (drives modal size)
  const destinationCount = useMemo(() => {
    if (!checkoutDestinationState || checkoutDestinationState.showingFarewell) return 0;
    let count = 0;
    if (deviceConfig?.checkout.raumwechsel_enabled !== false) count++;
    if (schulhofRoomId && deviceConfig?.checkout.schulhof_enabled !== false) count++;
    if (wcRoomId && deviceConfig?.checkout.wc_enabled !== false) count++;
    if (checkoutDestinationState.dailyCheckoutAvailable) count++;
    return count;
  }, [deviceConfig, schulhofRoomId, wcRoomId, checkoutDestinationState]);

  // Pickup query prompt state
  const [isAwaitingPickupQueryScan, setIsAwaitingPickupQueryScan] = useState(false);
  const isPickupQueryLoading =
    rfid.scanMode === 'pickupQuery' && rfid.processingQueue.size > 0 && !currentScan;

  useEffect(() => {
    if (currentScan && isAwaitingPickupQueryScan) {
      setIsAwaitingPickupQueryScan(false);
    }
  }, [currentScan, isAwaitingPickupQueryScan]);

  // Clear stale checkout/feedback/farewell state when a new scan arrives.
  // A "new scan" is detected by: different RFID tag, different visit_id, or
  // a check-in arriving while we're in a checkout flow (always means new scan).
  useEffect(() => {
    if (!currentScan || !checkoutDestinationState) return;

    const currentRfid = currentScan.scannedTagId ?? '';
    const isDifferentTag = currentRfid && checkoutDestinationState.rfid !== currentRfid;
    const isDifferentVisit =
      feedbackVisitIdRef.current !== null &&
      currentScan.visit_id != null &&
      currentScan.visit_id !== feedbackVisitIdRef.current;
    const isCheckinDuringCheckoutFlow = currentScan.action === 'checked_in';

    if (isDifferentTag || isDifferentVisit || isCheckinDuringCheckoutFlow) {
      logger.debug('Clearing stale checkout state for new scan', {
        reason: isDifferentTag
          ? 'different_tag'
          : isDifferentVisit
            ? 'different_visit'
            : 'checkin_during_checkout',
        oldRfid: checkoutDestinationState.rfid,
        newRfid: currentRfid,
        newAction: currentScan.action,
      });
      setCheckoutDestinationState(null);
      setShowFeedbackPrompt(false);
      feedbackVisitIdRef.current = null;
    }
  }, [currentScan, checkoutDestinationState, setCheckoutDestinationState]);

  // Start scanning when component mounts
  useEffect(() => {
    const initializeScanning = async () => {
      await startScanning();
    };

    void initializeScanning();

    // Cleanup: stop scanning when component unmounts
    return () => {
      const { hideScanModal, resetScanMode } = useUserStore.getState();
      hideScanModal();
      resetScanMode();
      void stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Function to fetch current session info
  const fetchSessionInfo = async () => {
    if (!authenticatedUser?.pin) return;

    try {
      const session = await api.getCurrentSession(authenticatedUser.pin);
      logger.debug('Session info received', { session });

      if (session) {
        const count = session.active_students ?? 0;
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

    // Set up periodic updates every 15 seconds (for multi-kiosk sync)
    const interval = setInterval(() => {
      void fetchSessionInfo();
    }, 15000);

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

        // Find toilet room by alias, preferring the canonical backend name.
        // WC_ROOM_ALIASES is canonical-first, so the first match wins.
        const wcRoom = findRoomByAliases(rooms, WC_ROOM_ALIASES);
        if (wcRoom) {
          setWcRoomId(wcRoom.id);
          logger.info('Found toilet room', { id: wcRoom.id, name: wcRoom.name });
        } else {
          logger.warn('No WC/Toilette room found - Toilette button will not work');
        }
      } catch (error) {
        logger.error('Failed to fetch Schulhof room', { error: serializeError(error) });
        // Non-critical error - continue without Schulhof functionality
      }
    };

    void fetchSchulhofRoom();
  }, [authenticatedUser?.pin]);

  // Fetch device config once on mount (checkout button visibility, feedback settings)
  useEffect(() => {
    const fetchDeviceConfig = async () => {
      try {
        const config = await api.getDeviceConfig();
        setDeviceConfig(config);
        logger.info('Device config loaded', {
          raumwechsel: config.checkout.raumwechsel_enabled,
          schulhof: config.checkout.schulhof_enabled,
          wc: config.checkout.wc_enabled,
          feedbackEnabled: config.feedback.enabled,
        });
      } catch (error) {
        logger.error('Failed to fetch device config', { error: serializeError(error) });
        // Non-critical — buttons default to visible when config is unavailable
      }
    };

    void fetchDeviceConfig();
  }, []);

  // Update student count based on scan result
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
          const delta = getCheckinCountDelta(extendedScan);
          if (delta !== 0) setStudentCount(prev => Math.max(0, prev + delta));
        }
        break;
      case 'checked_out': {
        // Uses scan.scannedTagId directly instead of looking up from recentTagScans
        // (fixes race condition).
        setCheckoutDestinationState({
          rfid: currentScan.scannedTagId ?? '',
          studentName: currentScan.student_name,
          studentId: currentScan.student_id,
          dailyCheckoutAvailable: currentScan.daily_checkout_available ?? false,
          showingFarewell: false,
        });
        const delta = getCheckoutCountDelta();
        // Legacy: optimistic delta fallback for servers that don't provide active_students
        if (!hasAuthoritativeCount && delta !== 0)
          setStudentCount(prev => Math.max(0, prev + delta));
        break;
      }
      case 'transferred':
        // Legacy: optimistic delta fallback for servers that don't provide active_students
        if (!hasAuthoritativeCount) {
          const delta = getTransferCountDelta(currentScan, selectedRoom?.name);
          if (delta !== 0) setStudentCount(prev => Math.max(0, prev + delta));
        }
        break;
    }

    // Apply authoritative count after side effects
    // Skip for Schulhof scans: active_students refers to the Schulhof room, not our room
    if (shouldApplyAuthoritativeCount(extendedScan)) {
      setStudentCount(currentScan.active_students!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScan, showModal]); // Only update when scan modal shows

  // Determine modal timeout duration based on current state
  const modalTimeoutDuration = useMemo(
    () =>
      getModalTimeoutDuration({
        isPickupQueryLoading,
        isAwaitingPickupQueryScan,
        showingFarewell: checkoutDestinationState?.showingFarewell ?? false,
        hasCheckoutDestination: !!checkoutDestinationState,
        showFeedbackPrompt,
        scanAction: currentScan?.action,
        hasPickupTime: !!currentScan?.pickup_time,
        scanTimeout: rfid.scanTimeout,
        modalDisplayTime: rfid.modalDisplayTime,
      }),
    [
      checkoutDestinationState,
      currentScan,
      isAwaitingPickupQueryScan,
      isPickupQueryLoading,
      rfid.modalDisplayTime,
      rfid.scanTimeout,
      showFeedbackPrompt,
    ]
  );

  // Handle modal timeout - cleanup state and dismiss modal
  // Student is already checked out by the server, so timeout just closes the modal
  const handleModalTimeout = useCallback(() => {
    logger.debug('Modal timeout triggered', {
      hasDestinationState: !!checkoutDestinationState,
      showingFarewell: checkoutDestinationState?.showingFarewell,
      showFeedbackPrompt,
      isAwaitingPickupQueryScan,
      isPickupQueryLoading,
      navigateOnClose: (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose,
    });

    // Check if navigation is required after modal close
    const navigateTo = (currentScan as { navigateOnClose?: string } | null)?.navigateOnClose;

    if (isPickupQueryLoading) {
      logger.warn('Pickup query loading timed out, showing timeout error before reset', {
        tagId: rfid.pickupQueryTagId,
        scanContextId: rfid.scanContextId,
      });

      if (rfid.pickupQueryTagId) {
        removeFromProcessingQueue(rfid.pickupQueryTagId);
      }

      setIsAwaitingPickupQueryScan(false);
      setScanResult(createPickupQueryTimeoutResult());
      showScanModal();
      return;
    }

    // Clean up checkout destination state
    if (checkoutDestinationState) {
      setCheckoutDestinationState(null);
    }

    // Clear feedback prompt state to prevent orphaned state (Issue #129 Bug 2 fix)
    if (showFeedbackPrompt) {
      setShowFeedbackPrompt(false);
    }
    // Always clear visit ID ref to prevent stale ref from wiping next checkout's destination state
    feedbackVisitIdRef.current = null;

    if (isAwaitingPickupQueryScan) {
      setIsAwaitingPickupQueryScan(false);
    }

    if (rfid.scanMode === 'pickupQuery') {
      resetScanMode();
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
  }, [
    checkoutDestinationState,
    currentScan,
    hideScanModal,
    removeFromProcessingQueue,
    isAwaitingPickupQueryScan,
    isPickupQueryLoading,
    navigate,
    rfid.pickupQueryTagId,
    rfid.scanMode,
    rfid.scanContextId,
    resetScanMode,
    setCheckoutDestinationState,
    setScanResult,
    showFeedbackPrompt,
    showScanModal,
  ]);

  const handleAnmelden = () => {
    // Stop scanning temporarily
    void stopScanning(); // Handle async function
    // Navigate to PIN page for teacher access
    void navigate('/pin');
  };

  const handlePickupQueryClick = () => {
    logger.info('Starting pickup query mode');
    setScanResult(null);
    setIsAwaitingPickupQueryScan(true);
    startPickupQueryMode();
    showScanModal();
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
      const response = await api.toggleAttendance(
        authenticatedUser.pin,
        checkoutDestinationState.rfid,
        'confirm_daily_checkout',
        'zuhause'
      );
      logger.info('Daily checkout confirmed');
      feedbackVisitIdRef.current = currentScan?.visit_id ?? null;

      // Show feedback prompt only if feedback is enabled for this tenant
      const feedbackEnabled = response.data?.feedback_enabled !== false;
      if (feedbackEnabled) {
        setShowFeedbackPrompt(true);
      } else {
        logger.info('Feedback disabled for tenant, skipping feedback prompt');
        setCheckoutDestinationState(prev => (prev ? { ...prev, showingFarewell: true } : null));
      }
    } catch (error) {
      logger.error('Failed to confirm daily checkout', {
        rfid: checkoutDestinationState.rfid,
        error: error instanceof Error ? error.message : String(error),
      });
      // Still proceed — the visit is already ended,
      // attendance sync failure shouldn't block the student.
      // Fall back to checkin scan's feedback_enabled flag.
      feedbackVisitIdRef.current = currentScan?.visit_id ?? null;
      const feedbackEnabled = currentScan?.feedback_enabled !== false;
      if (feedbackEnabled) {
        setShowFeedbackPrompt(true);
      } else {
        setCheckoutDestinationState(prev => (prev ? { ...prev, showingFarewell: true } : null));
      }
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

  const shouldShowCheckModal = showModal && (!!currentScan || isAwaitingPickupQueryScan);
  const shouldKeepPickupQueryModalOpen = isAwaitingPickupQueryScan || isPickupQueryLoading;
  const isPickupQueryPromptOpen =
    shouldShowCheckModal && isAwaitingPickupQueryScan && !isPickupQueryLoading && !currentScan;
  const isPickupQueryVisualState =
    isPickupQueryPromptOpen || isPickupQueryLoading || currentScan?.action === 'pickup_info';
  const isPickupQueryHeadingState = isPickupQueryPromptOpen || isPickupQueryLoading;
  const pickupQueryButtonDisabled = showModal || rfid.processingQueue.size > 0;

  return {
    // Store selections used by the page guard clause and header
    selectedActivity,
    selectedRoom,
    authenticatedUser,
    // Scan state
    currentScan,
    studentCount,
    processingQueueSize: rfid.processingQueue.size,
    scanContextId: rfid.scanContextId,
    // Checkout destination flow
    checkoutDestinationState,
    setCheckoutDestinationState,
    handleDestinationSelect,
    destinationCount,
    schulhofRoomId,
    wcRoomId,
    deviceConfig,
    // Feedback flow
    showFeedbackPrompt,
    handleNachHause,
    handleFeedbackSubmit,
    // Pickup query flow
    isAwaitingPickupQueryScan,
    isPickupQueryLoading,
    isPickupQueryPromptOpen,
    isPickupQueryVisualState,
    isPickupQueryHeadingState,
    pickupQueryButtonDisabled,
    handlePickupQueryClick,
    // Modal wiring
    shouldShowCheckModal,
    shouldKeepPickupQueryModalOpen,
    modalTimeoutDuration,
    handleModalTimeout,
    // Navigation
    handleAnmelden,
  };
}
