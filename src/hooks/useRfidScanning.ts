import { adapter } from '@platform';
import { useEffect, useRef, useCallback } from 'react';

import {
  isMockScanSourceRunning,
  resetMockScanSourceForTesting,
  startMockScanSource,
  stopMockScanSource,
} from '../dev/mockScanSource';
import { isRealScanningEnabled } from '../platform/adapter';
import type { NfcScanEvent } from '../platform/adapter';
import { api } from '../services/api';
import type { RfidScanResult } from '../services/api';
import {
  createScanErrorResult,
  createSessionExpiredResult,
  createSupervisorRedirectResult,
  evaluateSupervisorScan,
  processStudentBookkeeping,
  runPickupQuery,
  updateSessionActivityQuietly,
} from '../services/scanProcessor';
import { useUserStore } from '../store/userStore';
import { createLogger, serializeError } from '../utils/logger';

/** Reset module-level state between tests. Not for production use. */
export function __resetModuleStateForTesting(): void {
  resetMockScanSourceForTesting();
}

const logger = createLogger('useRfidScanning');
const PROCESSED_SCAN_ID_TTL_MS = 30_000;

export const useRfidScanning = () => {
  // Note: Navigation is now handled by page components via navigateOnClose flag in scan result

  const {
    rfid,
    startRfidScanning,
    stopRfidScanning,
    setScanResult,
    showScanModal,
    // Note: hideScanModal removed - modal timeout now handled exclusively by page components
    addToProcessingQueue,
    removeFromProcessingQueue,
    lockPickupQueryTag,
    // Enhanced duplicate prevention
    canProcessTag,
    recordTagScan,
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

  const showSupervisorRedirect = useCallback(() => {
    setScanResult(createSupervisorRedirectResult());
    showScanModal();
    // Modal timeout and navigation handled by ActivityScanningPage via useModalTimeout
  }, [setScanResult, showScanModal]);

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
          const outcome = await runPickupQuery({
            tagId,
            pin: freshUser.pin,
            scanContextId: freshRfid.scanContextId,
          });

          if (outcome.status === 'stale') {
            return;
          }

          setScanResult(outcome.result);
          showScanModal();

          if (outcome.status === 'success') {
            removeFromProcessingQueue(tagId);
            await updateSessionActivityQuietly(freshUser.pin, 'pickup');
          }

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

      // Handle duplicate prevention (Layer 1: processing queue)
      if (!canProcessTag(tagId)) {
        logger.debug('Tag blocked by duplicate prevention', { tagId });
        return;
      }

      let isInProcessingQueue = false;
      const startTime = Date.now();

      try {
        // Initialize scan tracking inside try so finally can reliably clean up.
        addToProcessingQueue(tagId);
        isInProcessingQueue = true;
        recordTagScan(tagId, { timestamp: Date.now() });

        logger.info('Starting network scan (cache disabled)');

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

        // Include scannedTagId so ActivityScanningPage can use it directly
        // instead of looking it up from recentTagScans (fixes race condition)
        setScanResult({ ...result, scannedTagId: tagId });

        // Handle supervisor authentication (handled outcomes end the scan here)
        const supervisorOutcome = await evaluateSupervisorScan({
          result,
          tagId,
          currentSession: freshSession,
          pin: freshUser.pin,
          scannedSupervisors: scannedSupervisorsRef.current,
          addSupervisorFromRfid,
          addActiveSupervisorTag,
          isActiveSupervisor,
        });

        if (supervisorOutcome.handled) {
          if (supervisorOutcome.presentation === 'redirect') {
            showSupervisorRedirect();
          } else {
            setScanResult(supervisorOutcome.result);
            showScanModal();
          }
          return;
        }

        // Process student bookkeeping
        processStudentBookkeeping({
          result,
          tagId,
          recordTagScan,
        });

        // Show result modal now that we have real data from the server
        showScanModal();

        // Update session activity (fire-and-forget)
        await updateSessionActivityQuietly(freshUser.pin, 'scan');
      } catch (error) {
        logger.error('Failed to process RFID scan', { error: serializeError(error) });
        const errorResult = createScanErrorResult(error);
        setScanResult(errorResult);
        showScanModal();

        // For STUDENT_ALREADY_ACTIVE (issue #844) the backend tells us
        // exactly which student is on the reader. Cache the result like
        // the happy path does so pages reading recentTagScans see it.
        if (errorResult.action === 'already_in' && errorResult.student_id !== null) {
          const studentId = errorResult.student_id.toString();
          recordTagScan(tagId, {
            timestamp: Date.now(),
            studentId,
            result: errorResult,
          });
        }
      } finally {
        if (isInProcessingQueue) {
          removeFromProcessingQueue(tagId);
        }
      }
    },
    [
      setScanResult,
      showScanModal,
      addToProcessingQueue,
      removeFromProcessingQueue,
      lockPickupQueryTag,
      canProcessTag,
      recordTagScan,
      addSupervisorFromRfid,
      addActiveSupervisorTag,
      isActiveSupervisor,
      showSupervisorRedirect,
    ]
  );

  // Create onScan callback for the adapter (dedups by scanId + processes scan)
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
      void processScan(tagId);
    },
    [processScan]
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
      if (!isMockScanSourceRunning()) {
        startRfidScanning(); // Update store state
        startMockScanSource(onAdapterScan);
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
  }, [startRfidScanning, showSystemError, waitForBackendServiceState, onAdapterScan]);

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
      } else if (isMockScanSourceRunning()) {
        // Stop mock scanning
        stopMockScanSource();
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
      stopMockScanSource();
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
