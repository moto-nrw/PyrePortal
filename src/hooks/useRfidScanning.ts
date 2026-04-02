import { useEffect, useRef, useCallback } from 'react';

import { adapter } from '@platform';

import type { NfcScanEvent } from '../platform/adapter';
import { api, mapApiErrorToGerman, ApiError } from '../services/api';
import type { RfidScanResult, CurrentSession } from '../services/api';
import { useUserStore } from '../store/userStore';
import { getSecureRandomInt } from '../utils/crypto';
import { createLogger, serializeError } from '../utils/logger';
import { isRfidEnabled } from '../utils/tauriContext';

/**
 * True when the current platform uses real NFC/RFID hardware (not mock).
 * - GKT: always real (NFC via system.js)
 * - Tauri + VITE_ENABLE_RFID=true: real (MFRC522 hardware)
 * - Tauri + VITE_ENABLE_RFID=false: mock
 * - Browser: mock
 */
const isRealScanningEnabled = (): boolean => {
  return adapter.platform === 'gkt' || isRfidEnabled();
};

// Mock scanning interval for development
let mockScanInterval: ReturnType<typeof setInterval> | null = null;
let mockScanCounter = 0;

/** Reset module-level state between tests. Not for production use. */
export function __resetModuleStateForTesting(): void {
  if (mockScanInterval) {
    clearInterval(mockScanInterval);
    mockScanInterval = null;
  }
  mockScanCounter = 0;
}

const logger = createLogger('useRfidScanning');
const PROCESSED_SCAN_ID_TTL_MS = 30_000;

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
 * Uses crypto.randomUUID() for cryptographically secure random values.
 */
const generateScanId = (): string => `scan_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

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
  scannedSupervisorsRef: { current: Set<number> };
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

  logger.info('Supervisor authenticated successfully', {
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
    logger.info('Supervisor synced via RFID (network path)', {
      staffId,
      sessionId: currentSession.active_group_id,
    });
  } catch (error) {
    logger.warn('Supervisor sync failed (network path)', {
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
    lockPickupQueryTag,
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
  const processedScanIdsRef = useRef<Map<number, number>>(new Map());

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
    if (!isRealScanningEnabled() || isInitializedRef.current) {
      return;
    }

    try {
      await adapter.initializeNfc();
      isInitializedRef.current = true;
      logger.info('RFID service initialized');
    } catch (error) {
      logger.error('Failed to initialize RFID service', { error: serializeError(error) });
      showSystemError(
        'RFID-Initialisierung fehlgeschlagen',
        'Das RFID-Lesegerät konnte nicht initialisiert werden. Bitte Gerät neu starten.'
      );
    }
  }, [showSystemError]);

  const processScan = useCallback(
    async (tagId: string) => {
      // Read fresh state from store to avoid stale closures
      // (the event listener closure may hold outdated selectedRoom/authenticatedUser)
      const currentState = useUserStore.getState();
      const freshRoom = currentState.selectedRoom;
      const freshUser = currentState.authenticatedUser;
      const freshSession = currentState.currentSession;
      const freshRfid = currentState.rfid;

      // Validate authentication state
      if (!freshUser?.pin || !freshRoom) {
        logger.error('Missing authentication or room selection');
        setScanResult(createSessionExpiredResult());
        showScanModal();
        return;
      }

      if (freshRfid.scanMode === 'pickupQuery') {
        if (freshRfid.pickupQueryTagId && freshRfid.pickupQueryTagId !== tagId) {
          logger.debug('Pickup query already locked to another tag, skipping scan', {
            requestedTagId: tagId,
            lockedTagId: freshRfid.pickupQueryTagId,
            scanContextId: freshRfid.scanContextId,
          });
          return;
        }

        if (freshRfid.pickupQueryTagId === tagId) {
          logger.debug('Pickup query already completed or in progress for this tag, skipping', {
            tagId,
            scanContextId: freshRfid.scanContextId,
          });
          return;
        }

        if (freshRfid.processingQueue.has(tagId)) {
          logger.debug('Pickup query tag already processing, skipping', { tagId });
          return;
        }

        lockPickupQueryTag(tagId);
        addToProcessingQueue(tagId);
        try {
          const result = await api.queryPickupInfo({ student_rfid: tagId }, freshUser.pin);
          const latestState = useUserStore.getState();
          if (
            latestState.rfid.scanMode !== 'pickupQuery' ||
            latestState.rfid.scanContextId !== freshRfid.scanContextId
          ) {
            logger.debug('Discarding stale pickup query result', {
              tagId,
              scanContextId: freshRfid.scanContextId,
            });
            return;
          }

          const { active_students: _ignoredActiveStudents, ...pickupResult } = result;
          setScanResult({ ...pickupResult, scannedTagId: tagId });
          showScanModal();
          removeFromProcessingQueue(tagId);

          try {
            await api.updateSessionActivity(freshUser.pin);
            logger.debug('Session activity updated after pickup query');
          } catch (activityError) {
            logger.warn('Failed to update session activity after pickup query', {
              error: activityError,
            });
          }

          return;
        } catch (error) {
          logger.error('Failed to query pickup info', { error: serializeError(error) });

          const latestState = useUserStore.getState();
          if (
            latestState.rfid.scanMode !== 'pickupQuery' ||
            latestState.rfid.scanContextId !== freshRfid.scanContextId
          ) {
            logger.debug('Discarding stale pickup query error', {
              tagId,
              scanContextId: freshRfid.scanContextId,
            });
            return;
          }

          setScanResult(createScanErrorResult(error));
          showScanModal();
          return;
        } finally {
          removeFromProcessingQueue(tagId);
        }
      }

      // Fast path for already-authenticated supervisors
      if (isActiveSupervisor(tagId)) {
        logger.info('Active supervisor tag detected, redirecting immediately', { tagId });
        showSupervisorRedirect();
        return;
      }

      logger.info('Processing RFID scan', { tagId });

      // Handle duplicate prevention (Layer 1: processing queue, Layer 3: student history)
      if (!canProcessTag(tagId)) {
        logger.debug('Tag blocked by duplicate prevention', { tagId });
        return;
      }

      let isInProcessingQueue = false;
      const scanId = generateScanId();
      const startTime = Date.now();

      try {
        // Initialize scan tracking inside try so finally can reliably clean up.
        addToProcessingQueue(tagId);
        isInProcessingQueue = true;
        recordTagScan(tagId, { timestamp: Date.now() });

        // Track optimistic scan state (no modal yet - wait for API response)
        addOptimisticScan(createOptimisticScan(scanId, tagId));
        logger.info('Starting network scan (cache disabled)');
        updateOptimisticScan(scanId, 'processing');

        // Make API call (server is single source of truth)
        const result = await api.processRfidScan(
          { student_rfid: tagId, action: 'checkin', room_id: freshRoom.id },
          freshUser.pin
        );

        logger.info('RFID scan completed via server', {
          action: result.action,
          studentName: result.student_name,
          responseTime: Date.now() - startTime,
        });

        updateOptimisticScan(scanId, 'success');
        // Include scannedTagId so ActivityScanningPage can use it directly
        // instead of looking it up from recentTagScans (fixes race condition)
        setScanResult({ ...result, scannedTagId: tagId });

        // Handle supervisor authentication (returns true if handled)
        const supervisorHandled = await handleSupervisorAuthentication({
          result,
          tagId,
          scanId,
          currentSession: freshSession,
          pin: freshUser.pin,
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

        // Show result modal now that we have real data (not optimistic)
        showScanModal();

        // Update session activity (fire-and-forget)
        try {
          await api.updateSessionActivity(freshUser.pin);
          logger.debug('Session activity updated');
        } catch (activityError) {
          logger.warn('Failed to update session activity', { error: activityError });
        }

        removeOptimisticScan(scanId);
      } catch (error) {
        logger.error('Failed to process RFID scan', { error: serializeError(error) });
        updateOptimisticScan(scanId, 'failed');
        setScanResult(createScanErrorResult(error));
        removeOptimisticScan(scanId);
        showScanModal();
      } finally {
        if (isInProcessingQueue) {
          removeFromProcessingQueue(tagId);
        }
      }
    },
    [
      setScanResult,
      showScanModal,
      addOptimisticScan,
      updateOptimisticScan,
      removeOptimisticScan,
      updateStudentHistory,
      addToProcessingQueue,
      removeFromProcessingQueue,
      lockPickupQueryTag,
      canProcessTag,
      recordTagScan,
      mapTagToStudent,
      addSupervisorFromRfid,
      addActiveSupervisorTag,
      isActiveSupervisor,
      showSupervisorRedirect,
    ]
  );

  // Create onScan callback for the adapter (checks blocked tags + processes scan)
  const onAdapterScan = useCallback(
    (event: NfcScanEvent) => {
      const { tagId, scanId } = event;
      const now = Date.now();
      const processedScanIds = processedScanIdsRef.current;

      processedScanIds.forEach((timestamp, processedScanId) => {
        if (now - timestamp >= PROCESSED_SCAN_ID_TTL_MS) {
          processedScanIds.delete(processedScanId);
        }
      });

      if (processedScanIds.has(scanId)) {
        logger.debug('RFID scan event already handled, skipping duplicate delivery', {
          tagId,
          scanId,
        });
        return;
      }

      processedScanIds.set(scanId, now);

      logger.info('RFID scan event received', { tagId, scanId });
      if (isTagBlocked(tagId)) {
        logger.debug('Tag blocked, skipping', { tagId, scanId });
      } else {
        void processScan(tagId);
      }
    },
    [isTagBlocked, processScan]
  );

  const waitForBackendServiceState = useCallback(
    async (expectedRunning: boolean, timeoutMs: number): Promise<boolean> => {
      if (!isRealScanningEnabled()) {
        return expectedRunning;
      }

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const serviceStatus = await adapter.getServiceStatus();
          if (serviceStatus?.is_running === expectedRunning) {
            return true;
          }
        } catch (error) {
          logger.debug('Service state poll failed', { error: serializeError(error) });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return false;
    },
    []
  );

  const startScanning = useCallback(async () => {
    const callTimestamp = Date.now();
    logger.debug('startScanning() called', {
      timestamp: callTimestamp,
      isServiceStartedRef: isServiceStartedRef.current,
      rfidEnabled: isRealScanningEnabled(),
    });

    if (isServiceStartedRef.current) {
      if (!isRealScanningEnabled()) {
        logger.debug('Service already started in mock mode, ensuring store state is synchronized');
        startRfidScanning();
        return;
      }

      const backendStillRunning = await waitForBackendServiceState(true, 600);
      if (backendStillRunning) {
        logger.debug('Service already started, ensuring store state is synchronized');
        startRfidScanning();
        return;
      }

      logger.warn('Service start ref was stale, resetting and attempting restart');
      isServiceStartedRef.current = false;
    }

    // Check if RFID is enabled
    if (!isRealScanningEnabled()) {
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

            // Pick a random tag from the list using unbiased secure randomness
            const randomIndex = getSecureRandomInt(mockStudentTags.length);
            const mockTagId = mockStudentTags[randomIndex];
            const scanId = ++mockScanCounter;

            logger.info('Mock RFID scan generated', {
              tagId: mockTagId,
              scanId,
              platform: 'Development Mock',
            });

            // Check if tag is blocked before processing
            if (isTagBlocked(mockTagId)) {
              logger.debug('Mock tag blocked, skipping', { tagId: mockTagId });
            } else {
              onAdapterScan({ tagId: mockTagId, scanId });
            }
          },
          5000 + getSecureRandomInt(5000)
        ); // Random interval between 5-10 seconds

        isServiceStartedRef.current = true;
        logger.info('Mock RFID scanning started');
      }
      return;
    }

    // Real RFID scanning
    try {
      logger.debug('Calling start_rfid_service backend command', {
        timestamp: callTimestamp,
      });
      await adapter.startScanning(onAdapterScan);
      const backendStarted = await waitForBackendServiceState(true, 2000);
      if (!backendStarted) {
        throw new Error('RFID service did not report running state after start command');
      }
      isServiceStartedRef.current = true;
      startRfidScanning(); // Update store state
      logger.debug('RFID background service started successfully', {
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
    } catch (error) {
      logger.error('Failed to start RFID service', {
        error: serializeError(error),
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
      isServiceStartedRef.current = false;
      showSystemError(
        'RFID-Service Start fehlgeschlagen',
        'Das RFID-Lesegerät konnte nicht gestartet werden. Bitte Gerät prüfen.'
      );
    }
  }, [startRfidScanning, isTagBlocked, showSystemError, waitForBackendServiceState, onAdapterScan]);

  const stopScanning = useCallback(async () => {
    const callTimestamp = Date.now();
    logger.debug('stopScanning() called', {
      timestamp: callTimestamp,
      isServiceStartedRef: isServiceStartedRef.current,
      rfidEnabled: isRealScanningEnabled(),
    });

    if (!isServiceStartedRef.current) {
      logger.debug('Service not running, but ensuring store state is synchronized');
      // Even if service is not tracked as running, update store state
      stopRfidScanning();
      return;
    }

    try {
      if (isRealScanningEnabled()) {
        logger.debug('Calling stop_rfid_service backend command', {
          timestamp: callTimestamp,
        });
        await adapter.stopScanning();
        const backendStopped = await waitForBackendServiceState(false, 2500);
        if (!backendStopped) {
          logger.warn('RFID backend did not confirm stop within timeout');
        }
      } else if (mockScanInterval) {
        // Stop mock scanning
        clearInterval(mockScanInterval);
        mockScanInterval = null;
        logger.info('Mock RFID scanning stopped');
      }
      isServiceStartedRef.current = false;
      stopRfidScanning(); // Update store state
      logger.debug('RFID service stopped successfully', {
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
    } catch (error) {
      logger.error('Failed to stop RFID service', {
        error: serializeError(error),
        timestamp: Date.now(),
        timeSinceCall: Date.now() - callTimestamp,
      });
      // Even on error, update the ref and store state
      isServiceStartedRef.current = false;
      stopRfidScanning();
    }
  }, [stopRfidScanning, waitForBackendServiceState]);

  // Check actual service state from backend
  const syncServiceState = useCallback(async () => {
    if (!isRealScanningEnabled()) return;

    try {
      const serviceStatus = await adapter.getServiceStatus();
      if (serviceStatus?.is_running) {
        logger.info('RFID service is already running, re-registering listener');
        await adapter.startScanning(onAdapterScan);
        isServiceStartedRef.current = true;
        startRfidScanning(); // Update store state
      } else {
        isServiceStartedRef.current = false;
        stopRfidScanning();
      }
    } catch (error) {
      logger.debug('Could not get RFID service status', { error });
    }
  }, [onAdapterScan, startRfidScanning, stopRfidScanning]);

  // Initialize service and setup event listener on mount
  useEffect(() => {
    void initializeService();
    void syncServiceState();
  }, [initializeService, syncServiceState]);

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
    }, 30000); // Clean up every 30 seconds (memory hygiene only, not dedup-critical)

    return () => {
      clearInterval(cleanupInterval);
    };
  }, [clearOldTagScans]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
