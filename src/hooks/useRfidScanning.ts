import { useEffect, useRef, useCallback } from 'react';

import { api, mapApiErrorToGerman, ApiError } from '../services/api';
import type { RfidScanResult, CurrentSession } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

// Tauri event listening
let eventListener: (() => void) | null = null;

// Mock scanning interval for development
let mockScanInterval: ReturnType<typeof setInterval> | null = null;

const logger = createLogger('useRfidScanning');

// ============================================================================
// Helper functions to reduce cognitive complexity in processScan
// ============================================================================

/**
 * Creates a session expired error result for display.
 */
const createSessionExpiredResult = (): RfidScanResult & { navigateOnClose: string } => ({
  student_name: 'Sitzung abgelaufen',
  student_id: null,
  action: 'error',
  message: 'Bitte melden Sie sich erneut an.',
  showAsError: true,
  navigateOnClose: '/home',
});

/**
 * Creates the initial optimistic scan object for UI feedback.
 */
const createOptimisticScan = (scanId: string, tagId: string) => ({
  id: scanId,
  tagId,
  status: 'pending' as const,
  optimisticAction: 'checkin' as const,
  optimisticStudentCount: 0,
  timestamp: Date.now(),
  studentInfo: {
    name: 'Processing...',
    id: 0,
  },
});

/**
 * Generates a unique scan ID for tracking optimistic updates.
 */
const generateScanId = (): string =>
  `scan_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Handles supervisor authentication from RFID scan.
 * Returns true if supervisor was handled (caller should return early).
 */
interface SupervisorHandlerParams {
  result: RfidScanResult;
  tagId: string;
  scanId: string;
  currentSession: CurrentSession | null;
  pin: string;
  scannedSupervisorsRef: React.MutableRefObject<Set<number>>;
  addSupervisorFromRfid: (staffId: number, staffName: string) => boolean;
  addActiveSupervisorTag: (tagId: string) => void;
  isActiveSupervisor: (tagId: string) => boolean;
  setScanResult: (result: RfidScanResult) => void;
  removeOptimisticScan: (scanId: string) => void;
  showScanModal: () => void;
  showSupervisorRedirect: (scanId?: string) => void;
}

const handleSupervisorAuthentication = async (
  params: SupervisorHandlerParams
): Promise<boolean> => {
  const {
    result,
    tagId,
    scanId,
    currentSession,
    pin,
    scannedSupervisorsRef,
    addSupervisorFromRfid,
    addActiveSupervisorTag,
    isActiveSupervisor,
    setScanResult,
    removeOptimisticScan,
    showScanModal,
    showSupervisorRedirect,
  } = params;

  if (result.action !== 'supervisor_authenticated') {
    return false;
  }

  const staffId = result.student_id;
  const staffName = result.student_name;

  if (staffId === null) {
    return false;
  }

  const alreadySelected = addSupervisorFromRfid(staffId, staffName);
  const wasSeenThisSession = scannedSupervisorsRef.current.has(staffId);
  const isRepeatSupervisor = alreadySelected || wasSeenThisSession || isActiveSupervisor(tagId);

  // Track in-memory and mark tag active for fast return
  scannedSupervisorsRef.current.add(staffId);
  addActiveSupervisorTag(tagId);

  // Sync supervisors with backend (fire-and-forget)
  if (currentSession && pin) {
    void syncSupervisorsWithBackend(currentSession, pin, staffId);
  }

  logger.info('Betreuer erfolgreich authentifiziert', {
    supervisorName: staffName,
    message: result.message,
    staffId,
    isRepeatSupervisor,
    alreadySelected,
  });

  // Show redirect for repeat supervisors
  if (isRepeatSupervisor) {
    showSupervisorRedirect(scanId);
    return true;
  }

  // First-time supervisor scan - show added message
  const firstScanResult: RfidScanResult = {
    ...result,
    student_name: 'Betreuer erkannt',
    message: `${result.student_name} wurde als Betreuer zu diesem Raum hinzugefügt.`,
  };
  setScanResult(firstScanResult);
  removeOptimisticScan(scanId);
  showScanModal();
  return true;
};

/**
 * Syncs supervisor list with backend after RFID authentication.
 */
const syncSupervisorsWithBackend = async (
  currentSession: CurrentSession,
  pin: string,
  staffId: number
): Promise<void> => {
  try {
    const updatedSupervisorIds = useUserStore.getState().selectedSupervisors.map(s => s.id);
    await api.updateSessionSupervisors(pin, currentSession.active_group_id, updatedSupervisorIds);
    logger.info('Betreuer per RFID synchronisiert (Netzwerkpfad)', {
      staffId,
      sessionId: currentSession.active_group_id,
    });
  } catch (error) {
    logger.warn('Sync der Betreuer fehlgeschlagen (Netzwerkpfad)', {
      error: error instanceof Error ? error.message : String(error),
      staffId,
    });
  }
};

/**
 * Processes successful student scan - updates bookkeeping and cache.
 */
interface StudentBookkeepingParams {
  result: RfidScanResult;
  tagId: string;
  mapTagToStudent: (tagId: string, studentId: string) => void;
  updateStudentHistory: (studentId: string, action: 'checkin' | 'checkout') => void;
  recordTagScan: (
    tagId: string,
    data: { timestamp: number; studentId?: string; result?: RfidScanResult }
  ) => void;
}

const processStudentBookkeeping = (params: StudentBookkeepingParams): void => {
  const { result, tagId, mapTagToStudent, updateStudentHistory, recordTagScan } = params;

  if (!result.student_id) {
    return;
  }

  const studentId = result.student_id.toString();
  const action = result.action === 'checked_in' ? 'checkin' : 'checkout';

  mapTagToStudent(tagId, studentId);
  updateStudentHistory(studentId, action);

  // Short-lived duplicate prevention cache (in-memory only)
  recordTagScan(tagId, {
    timestamp: Date.now(),
    studentId,
    result,
  });
};

/**
 * Determines error title based on error type.
 */
const getErrorTitle = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === 'ROOM_CAPACITY_EXCEEDED') return 'Raum voll';
    if (error.code === 'ACTIVITY_CAPACITY_EXCEEDED') return 'Aktivität voll';
  }
  return 'Scan fehlgeschlagen';
};

/**
 * Creates an error result for display when scan fails.
 */
const createScanErrorResult = (error: unknown): RfidScanResult => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Special handling for "already checked in" scenario
  if (errorMessage.includes('already has an active visit')) {
    return {
      student_name: 'Bereits eingecheckt',
      student_id: null,
      action: 'already_in',
      message: 'Dieser Schüler ist bereits in diesem Raum eingecheckt',
      isInfo: true,
    };
  }

  // Generic error handling
  const userFriendlyMessage = mapApiErrorToGerman(error);
  return {
    student_name: getErrorTitle(error),
    student_id: null,
    action: 'error',
    message: userFriendlyMessage || 'Bitte erneut versuchen',
    showAsError: true,
  };
};

export const useRfidScanning = () => {
  // Note: Navigation is now handled by page components via navigateOnClose flag in scan result

  const {
    rfid,
    authenticatedUser,
    selectedRoom,
    currentSession,
    startRfidScanning,
    stopRfidScanning,
    setScanResult,
    isTagBlocked,
    showScanModal,
    // Note: hideScanModal removed - modal timeout now handled exclusively by page components
    // New optimistic actions
    addOptimisticScan,
    updateOptimisticScan,
    removeOptimisticScan,
    updateStudentHistory,
    addToProcessingQueue,
    removeFromProcessingQueue,
    // Enhanced duplicate prevention
    canProcessTag,
    recordTagScan,
    mapTagToStudent,
    clearOldTagScans,
    // Supervisor RFID actions
    addSupervisorFromRfid,
    addActiveSupervisorTag,
    isActiveSupervisor,
  } = useUserStore();

  const isInitializedRef = useRef<boolean>(false);
  const isServiceStartedRef = useRef<boolean>(false);
  const scannedSupervisorsRef = useRef<Set<number>>(new Set());

  const showSupervisorRedirect = useCallback(
    (scanId?: string) => {
      const redirectResult: RfidScanResult = {
        student_name: 'Betreuer erkannt',
        student_id: null,
        action: 'supervisor_authenticated',
        message: 'Betreuer wird zum Home-Bildschirm weitergeleitet.',
        isInfo: true,
        // Flag to indicate navigation should happen on modal close
        navigateOnClose: '/home',
      } as RfidScanResult & { navigateOnClose: string };
      setScanResult(redirectResult);
      if (scanId) {
        removeOptimisticScan(scanId);
      }
      showScanModal();
      // Modal timeout and navigation handled by ActivityScanningPage via useModalTimeout
    },
    [removeOptimisticScan, setScanResult, showScanModal]
  );

  // Helper to show system error modal
  // Note: Modal timeout handled by page component via useModalTimeout hook
  const showSystemError = useCallback(
    (title: string, message: string) => {
      const errorResult: RfidScanResult = {
        student_name: title,
        student_id: null,
        action: 'error',
        message,
        showAsError: true,
      };
      setScanResult(errorResult);
      showScanModal();
      // Modal timeout handled by ActivityScanningPage via useModalTimeout
    },
    [setScanResult, showScanModal]
  );

  // Initialize RFID service on mount
  const initializeService = useCallback(async () => {
    if (!isRfidEnabled() || isInitializedRef.current) {
      return;
    }

    try {
      await safeInvoke('initialize_rfid_service');
      isInitializedRef.current = true;
      logger.info('RFID service initialized');
    } catch (error) {
      logger.error('Failed to initialize RFID service', { error });
      showSystemError(
        'RFID-Initialisierung fehlgeschlagen',
        'Das RFID-Lesegerät konnte nicht initialisiert werden. Bitte Gerät neu starten.'
      );
    }
  }, [showSystemError]);

  const processScan = useCallback(
    async (tagId: string) => {
      // Validate authentication state
      if (!authenticatedUser?.pin || !selectedRoom) {
        logger.error('Missing authentication or room selection');
        setScanResult(createSessionExpiredResult());
        showScanModal();
        return;
      }

      // Fast path for already-authenticated supervisors
      if (isActiveSupervisor(tagId)) {
        logger.info('Aktiver Betreuer-Tag erkannt, leite sofort um', { tagId });
        showSupervisorRedirect();
        return;
      }

      logger.info(`Processing RFID scan for tag: ${tagId}`);

      // Handle duplicate prevention
      if (!canProcessTag(tagId)) {
        logger.info(`Tag ${tagId} blocked by duplicate prevention`);
        const recentScan = rfid.recentTagScans.get(tagId);
        if (recentScan?.result && Date.now() - recentScan.timestamp < 2000) {
          setScanResult(recentScan.result);
          showScanModal();
        } else {
          logger.debug('Scan already in progress, please wait');
        }
        return;
      }

      // Initialize scan tracking
      addToProcessingQueue(tagId);
      recordTagScan(tagId, { timestamp: Date.now() });
      const scanId = generateScanId();
      const startTime = Date.now();

      try {
        // Show optimistic UI feedback
        addOptimisticScan(createOptimisticScan(scanId, tagId));
        showScanModal();
        logger.info('Starting network scan (cache disabled)');
        updateOptimisticScan(scanId, 'processing');

        // Make API call (server is single source of truth)
        const result = await api.processRfidScan(
          { student_rfid: tagId, action: 'checkin', room_id: selectedRoom.id },
          authenticatedUser.pin
        );

        logger.info(`RFID scan completed via server: ${result.action} for ${result.student_name}`, {
          responseTime: Date.now() - startTime,
        });

        updateOptimisticScan(scanId, 'success');
        setScanResult(result);

        // Handle supervisor authentication (returns true if handled)
        const supervisorHandled = await handleSupervisorAuthentication({
          result,
          tagId,
          scanId,
          currentSession,
          pin: authenticatedUser.pin,
          scannedSupervisorsRef,
          addSupervisorFromRfid,
          addActiveSupervisorTag,
          isActiveSupervisor,
          setScanResult,
          removeOptimisticScan,
          showScanModal,
          showSupervisorRedirect,
        });

        if (supervisorHandled) {
          return;
        }

        // Process student bookkeeping
        processStudentBookkeeping({
          result,
          tagId,
          mapTagToStudent,
          updateStudentHistory,
          recordTagScan,
        });

        // Update session activity (fire-and-forget)
        try {
          await api.updateSessionActivity(authenticatedUser.pin);
          logger.debug('Session activity updated');
        } catch (activityError) {
          logger.warn('Failed to update session activity', { error: activityError });
        }

        removeOptimisticScan(scanId);
      } catch (error) {
        logger.error('Failed to process RFID scan', { error });
        updateOptimisticScan(scanId, 'failed');
        setScanResult(createScanErrorResult(error));
        removeOptimisticScan(scanId);
        showScanModal();
      } finally {
        removeFromProcessingQueue(tagId);
      }
    },
    [
      authenticatedUser,
      selectedRoom,
      currentSession,
      setScanResult,
      showScanModal,
      addOptimisticScan,
      updateOptimisticScan,
      removeOptimisticScan,
      updateStudentHistory,
      addToProcessingQueue,
      removeFromProcessingQueue,
      canProcessTag,
      recordTagScan,
      mapTagToStudent,
      addSupervisorFromRfid,
      addActiveSupervisorTag,
      isActiveSupervisor,
      rfid.recentTagScans,
      showSupervisorRedirect,
    ]
  );

  // Setup event listener for RFID scans
  const setupEventListener = useCallback(async () => {
    if (!isRfidEnabled() || eventListener) {
      return;
    }

    try {
      // Import listen function dynamically for Tauri context
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen<{ tag_id: string; timestamp: number; platform: string }>(
        'rfid-scan',
        event => {
          const { tag_id, timestamp, platform } = event.payload;
          logger.info(`RFID scan event received: ${tag_id} from ${platform} at ${timestamp}`);

          // Check if tag is blocked before processing
          if (isTagBlocked(tag_id)) {
            logger.debug(`Tag ${tag_id} is blocked, skipping`);
          } else {
            void processScan(tag_id);
          }
        }
      );

      eventListener = unlisten;
      logger.info('RFID event listener setup complete');
    } catch (error) {
      logger.error('Failed to setup RFID event listener', { error });
      showSystemError(
        'RFID-Verbindung fehlgeschlagen',
        'Das RFID-System konnte nicht verbunden werden. Scannen nicht möglich.'
      );
    }
  }, [isTagBlocked, processScan, showSystemError]);

  const startScanning = useCallback(async () => {
    const callTimestamp = Date.now();
    logger.info('[RACE-DEBUG] startScanning() called', {
      timestamp: callTimestamp,
      isServiceStartedRef: isServiceStartedRef.current,
      rfidEnabled: isRfidEnabled(),
    });

    if (isServiceStartedRef.current) {
      logger.debug('Service already started, ensuring store state is synchronized');
      // Always update store state to reflect actual service state
      startRfidScanning();
      return;
    }

    // Check if RFID is enabled
    if (!isRfidEnabled()) {
      logger.info('RFID not enabled, starting mock scanning mode');

      // Start mock scanning interval
      if (!mockScanInterval) {
        startRfidScanning(); // Update store state

        // Generate mock scans every 3-5 seconds
        mockScanInterval = setInterval(
          () => {
            // Get mock tags from environment variable or use defaults
            const envTags = import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined;
            const mockStudentTags: string[] = envTags
              ? envTags.split(',').map(tag => tag.trim())
              : [
                  // Default realistic hardware format tags
                  '04:D6:94:82:97:6A:80',
                  '04:A7:B3:C2:D1:E0:F5',
                  '04:12:34:56:78:9A:BC',
                  '04:FE:DC:BA:98:76:54',
                  '04:11:22:33:44:55:66',
                ];

            // Pick a random tag from the list
            const mockTagId = mockStudentTags[Math.floor(Math.random() * mockStudentTags.length)];

            logger.info('Mock RFID scan generated', {
              tagId: mockTagId,
              platform: 'Development Mock',
            });

            // Check if tag is blocked before processing
            if (isTagBlocked(mockTagId)) {
              logger.debug(`Mock tag ${mockTagId} is blocked, skipping`);
            } else {
              void processScan(mockTagId);
            }
          },
          5000 + Math.random() * 5000
        ); // Random interval between 5-10 seconds

        isServiceStartedRef.current = true;
        logger.info('Mock RFID scanning started');
      }
      return;
    }

    // Real RFID scanning
    try {
      logger.info('[RACE-DEBUG] Calling start_rfid_service backend command', {
        timestamp: callTimestamp,
      });
      await safeInvoke('start_rfid_service');
      isServiceStartedRef.current = true;
      startRfidScanning(); // Update store state
      logger.info('[RACE-DEBUG] RFID background service started successfully', {
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
    } catch (error) {
      logger.error('[RACE-DEBUG] Failed to start RFID service', {
        error,
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
      showSystemError(
        'RFID-Service Start fehlgeschlagen',
        'Das RFID-Lesegerät konnte nicht gestartet werden. Bitte Gerät prüfen.'
      );
    }
  }, [startRfidScanning, isTagBlocked, processScan, showSystemError]);

  const stopScanning = useCallback(async () => {
    const callTimestamp = Date.now();
    logger.info('[RACE-DEBUG] stopScanning() called', {
      timestamp: callTimestamp,
      isServiceStartedRef: isServiceStartedRef.current,
      rfidEnabled: isRfidEnabled(),
    });

    if (!isServiceStartedRef.current) {
      logger.debug('Service not running, but ensuring store state is synchronized');
      // Even if service is not tracked as running, update store state
      stopRfidScanning();
      return;
    }

    try {
      if (isRfidEnabled()) {
        logger.info('[RACE-DEBUG] Calling stop_rfid_service backend command', {
          timestamp: callTimestamp,
        });
        await safeInvoke('stop_rfid_service');
      } else if (mockScanInterval) {
        // Stop mock scanning
        clearInterval(mockScanInterval);
        mockScanInterval = null;
        logger.info('Mock RFID scanning stopped');
      }
      isServiceStartedRef.current = false;
      stopRfidScanning(); // Update store state
      logger.info('[RACE-DEBUG] RFID service stopped successfully', {
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
    } catch (error) {
      logger.error('[RACE-DEBUG] Failed to stop RFID service', {
        error,
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
      // Even on error, update the ref and store state
      isServiceStartedRef.current = false;
      stopRfidScanning();
    }
  }, [stopRfidScanning]);

  // Check actual service state from backend
  const syncServiceState = useCallback(async () => {
    if (!isRfidEnabled()) return;

    try {
      const serviceStatus = await safeInvoke<{ is_running: boolean }>('get_rfid_service_status');
      if (serviceStatus?.is_running) {
        logger.info('RFID service is already running, synchronizing state');
        isServiceStartedRef.current = true;
        startRfidScanning(); // Update store state
      }
    } catch (error) {
      logger.debug('Could not get RFID service status', { error });
    }
  }, [startRfidScanning]);

  // Initialize service and setup event listener on mount
  useEffect(() => {
    void initializeService();
    void setupEventListener();
    void syncServiceState();
  }, [initializeService, setupEventListener, syncServiceState]);

  // Auto-restart scanning after modal hides
  useEffect(() => {
    if (!rfid.showModal && rfid.isScanning && !isServiceStartedRef.current) {
      logger.debug('Modal closed, restarting scanning');
      void startScanning();
    }
  }, [rfid.showModal, rfid.isScanning, startScanning]);

  // Cleanup old tag scans periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      clearOldTagScans();
    }, 2000); // Clean up every 2 seconds

    return () => {
      clearInterval(cleanupInterval);
    };
  }, [clearOldTagScans]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventListener) {
        eventListener();
        eventListener = null;
      }
      if (mockScanInterval) {
        clearInterval(mockScanInterval);
        mockScanInterval = null;
      }
      if (isServiceStartedRef.current) {
        void stopScanning();
      }
      // Reset the ref so scanning can restart when returning to the page
      isServiceStartedRef.current = false;
    };
  }, [stopScanning]);

  return {
    isScanning: rfid.isScanning,
    currentScan: rfid.currentScan,
    showModal: rfid.showModal,
    startScanning,
    stopScanning,
  };
};
