import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, mapServerErrorToGerman } from '../services/api';
import type { RfidScanResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

// Tauri event listening
let eventListener: (() => void) | null = null;

// Mock scanning interval for development
let mockScanInterval: ReturnType<typeof setInterval> | null = null;

const logger = createLogger('useRfidScanning');

export const useRfidScanning = () => {
  const navigate = useNavigate();

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
    hideScanModal,
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

  // Helper to show system error modal
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
      setTimeout(() => {
        hideScanModal();
      }, rfid.modalDisplayTime);
    },
    [setScanResult, showScanModal, hideScanModal, rfid.modalDisplayTime]
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
      if (!authenticatedUser?.pin || !selectedRoom) {
        logger.error('Missing authentication or room selection');
        showSystemError('Sitzung abgelaufen', 'Bitte melden Sie sich erneut an.');
        // Navigate to home after showing error
        setTimeout(() => {
          void navigate('/home');
        }, rfid.modalDisplayTime);
        return;
      }

      // Sofortiger Rückweg für bereits angemeldete Betreuer
      if (isActiveSupervisor(tagId)) {
        logger.info('Aktiver Betreuer-Tag erkannt, leite sofort um', { tagId });
        const infoResult: RfidScanResult = {
          student_name: 'Betreuer erkannt',
          student_id: null,
          action: 'supervisor_authenticated',
          message: 'Betreuer wird zum Home-Bildschirm weitergeleitet.',
          isInfo: true,
        };
        setScanResult(infoResult);
        showScanModal();
        setTimeout(() => {
          hideScanModal();
          void navigate('/home');
        }, 900);
        return;
      }

      logger.info(`Processing RFID scan for tag: ${tagId}`);

      // Enhanced duplicate prevention - check all layers
      if (!canProcessTag(tagId)) {
        logger.info(`Tag ${tagId} blocked by duplicate prevention`);

        // Check if we have a recent cached result to show
        const recentScan = rfid.recentTagScans.get(tagId);
        if (recentScan?.result && Date.now() - recentScan.timestamp < 2000) {
          // Show the cached result instead of making a new API call
          setScanResult(recentScan.result);
          showScanModal();
          setTimeout(() => {
            hideScanModal();
          }, rfid.modalDisplayTime);
        } else {
          // Just show a quick message that scan is processing
          logger.debug('Scan already in progress, please wait');
        }
        return;
      }

      // Add to processing queue immediately
      addToProcessingQueue(tagId);
      recordTagScan(tagId, { timestamp: Date.now() });

      // Generate unique ID for this scan
      const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const startTime = Date.now();

      try {
        // IMMEDIATE OPTIMISTIC UI FEEDBACK
        const optimisticScan = {
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
        };

        addOptimisticScan(optimisticScan);
        showScanModal();
        logger.info('Starting network scan (cache disabled)');
        updateOptimisticScan(scanId, 'processing');

        // NETWORK API CALL (single source of truth)
        const result = await api.processRfidScan(
          {
            student_rfid: tagId,
            action: 'checkin',
            room_id: selectedRoom.id,
          },
          authenticatedUser.pin
        );

        logger.info(`RFID scan completed via server: ${result.action} for ${result.student_name}`, {
          responseTime: Date.now() - startTime,
        });

        updateOptimisticScan(scanId, 'success');
        setScanResult(result);

        // Supervisor handling (no cache path)
        if (result.action === 'supervisor_authenticated') {
          const staffId = result.student_id;
          const staffName = result.student_name;

          if (staffId !== null) {
            addSupervisorFromRfid(staffId, staffName);
            addActiveSupervisorTag(tagId);

            if (currentSession && authenticatedUser?.pin) {
              void (async () => {
                try {
                  const updatedSupervisorIds = useUserStore
                    .getState()
                    .selectedSupervisors.map(s => s.id);
                  await api.updateSessionSupervisors(
                    authenticatedUser.pin,
                    currentSession.active_group_id,
                    updatedSupervisorIds
                  );
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
              })();
            }

            logger.info('Betreuer erfolgreich authentifiziert', {
              supervisorName: staffName,
              message: result.message,
              staffId,
            });
          }

          // Zweiter Scan desselben Betreuers: klare Weiterleitungsbotschaft
          if (staffId !== null && scannedSupervisorsRef.current.has(staffId)) {
            const redirectResult: RfidScanResult = {
              ...result,
              message: 'Betreuer erkannt – Weiterleitung zum Hauptbildschirm...',
            };
            setScanResult(redirectResult);
          }

          setTimeout(() => {
            hideScanModal();
            removeOptimisticScan(scanId);
          }, rfid.modalDisplayTime);

          return;
        }

        // Student bookkeeping (no caching)
        if (result.student_id) {
          const studentId = result.student_id.toString();
          const action = result.action === 'checked_in' ? 'checkin' : 'checkout';

          mapTagToStudent(tagId, studentId);
          updateStudentHistory(studentId, action);

          // short-lived duplicate prevention cache (in-memory only)
          recordTagScan(tagId, {
            timestamp: Date.now(),
            studentId,
            result,
          });
        }

        try {
          await api.updateSessionActivity(authenticatedUser.pin);
          logger.debug('Session activity updated');
        } catch (error) {
          logger.warn('Failed to update session activity', { error });
        }

        setTimeout(() => {
          hideScanModal();
          removeOptimisticScan(scanId);
        }, rfid.modalDisplayTime);
      } catch (error) {
        logger.error('Failed to process RFID scan', { error });

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('already has an active visit')) {
          logger.info('Student already has active visit - showing info to user');
          updateOptimisticScan(scanId, 'failed');

          const infoResult: RfidScanResult = {
            student_name: 'Bereits eingecheckt',
            student_id: null,
            action: 'already_in',
            message: 'Dieser Schüler ist bereits in diesem Raum eingecheckt',
            isInfo: true,
          };
          setScanResult(infoResult);
        } else {
          updateOptimisticScan(scanId, 'failed');
          const userFriendlyMessage = mapServerErrorToGerman(errorMessage);
          const errorResult: RfidScanResult = {
            student_name: 'Scan fehlgeschlagen',
            student_id: null,
            action: 'error',
            message: userFriendlyMessage || 'Bitte erneut versuchen',
            showAsError: true,
          };
          setScanResult(errorResult);
        }

        showScanModal();

        setTimeout(() => {
          hideScanModal();
          removeOptimisticScan(scanId);
        }, rfid.modalDisplayTime);
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
      hideScanModal,
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
      rfid.modalDisplayTime,
      rfid.recentTagScans,
      navigate,
      showSystemError,
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
          if (!isTagBlocked(tag_id)) {
            void processScan(tag_id);
          } else {
            logger.debug(`Tag ${tag_id} is blocked, skipping`);
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
            if (!isTagBlocked(mockTagId)) {
              void processScan(mockTagId);
            } else {
              logger.debug(`Mock tag ${mockTagId} is blocked, skipping`);
            }
          },
          3000 + Math.random() * 2000
        ); // Random interval between 3-5 seconds

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
      } else {
        // Stop mock scanning
        if (mockScanInterval) {
          clearInterval(mockScanInterval);
          mockScanInterval = null;
          logger.info('Mock RFID scanning stopped');
        }
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
