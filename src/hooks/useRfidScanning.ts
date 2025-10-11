import { useEffect, useRef, useCallback } from 'react';

import { api } from '../services/api';
import type { RfidScanResult } from '../services/api';
import { queueFailedScan } from '../services/syncQueue';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

// Extended type for error and info states
interface ExtendedRfidScanResult {
  student_name: string;
  student_id: number;
  action: 'checked_in' | 'checked_out' | 'transferred' | 'already_in' | 'error';
  message?: string;
  isInfo?: boolean;
  showAsError?: boolean;
  greeting?: string;
  visit_id?: number;
  room_name?: string;
  previous_room?: string;
  processed_at?: string;
  status?: string;
}

// Tauri event listening
let eventListener: (() => void) | null = null;

// Mock scanning interval for development
let mockScanInterval: ReturnType<typeof setInterval> | null = null;

const logger = createLogger('useRfidScanning');

export const useRfidScanning = () => {
  const {
    rfid,
    authenticatedUser,
    selectedRoom,
    selectedActivity,
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
    // Student cache actions
    getCachedStudentData,
    cacheStudentData,
    loadStudentCache,
  } = useUserStore();

  const isInitializedRef = useRef<boolean>(false);
  const isServiceStartedRef = useRef<boolean>(false);

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
    }
  }, []);

  const processScan = useCallback(
    async (tagId: string) => {
      if (!authenticatedUser?.pin || !selectedRoom) {
        logger.error('Missing authentication or room selection');
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

      // *** CACHE-FIRST SCANNING LOGIC ***
      const startTime = Date.now();

      // 1. CHECK CACHE FIRST (instant response ~5ms)
      const cachedStudent = getCachedStudentData(tagId);

      if (cachedStudent) {
        logger.info('CACHE HIT: Found cached student data', {
          tagId,
          studentId: cachedStudent.id,
          studentName: cachedStudent.name,
          cachedStatus: cachedStudent.status,
          responseTime: Date.now() - startTime,
        });

        // Show immediate UI with predicted action
        // Server logic: Same room = toggle (door behavior), Different room = always check-in
        const cachedResult: RfidScanResult = {
          student_id: cachedStudent.id,
          student_name: cachedStudent.name,
          action:
            cachedStudent.room === selectedRoom.name
              ? cachedStudent.status === 'checked_in'
                ? 'checked_out'
                : 'checked_in'
              : 'checked_in',
          room_name: selectedRoom.name,
          processed_at: new Date().toISOString(),
          message: undefined,
        };

        setScanResult(cachedResult);
        showScanModal();

        logger.info('Instant UI update completed with cached data', {
          responseTime: Date.now() - startTime,
        });

        // 2. BACKGROUND SYNC WITH SERVER (don't block UI)
        // Store the promise so it can be awaited later (prevents race conditions)
        const syncPromise = (async () => {
          try {
            logger.debug('Starting background sync for cached student');

            const syncResult = await api.processRfidScan(
              {
                student_rfid: tagId,
                action: 'checkin', // Let server determine actual action
                room_id: selectedRoom.id,
              },
              authenticatedUser.pin
            );

            logger.info('Background sync completed', {
              syncAction: syncResult.action,
              serverStudentName: syncResult.student_name,
              syncTime: Date.now() - startTime,
            });

            // Check if this is a supervisor scan
            if (syncResult.action === 'supervisor_authenticated') {
              // Update UI with supervisor result (not student cache)
              setScanResult(syncResult);
              logger.info('Supervisor authenticated (cache-first path)', {
                supervisorName: syncResult.student_name,
                message: syncResult.message,
              });
              // Don't cache supervisor data or update student history
              return;
            }

            // Update cache with fresh server data (silently)
            void cacheStudentData(tagId, syncResult, {
              room: syncResult.room_name ?? selectedRoom.name,
              activity: selectedActivity?.name,
            });

            // Update student history with actual server result
            if (syncResult.student_id) {
              const studentId = syncResult.student_id.toString();
              const action = syncResult.action === 'checked_in' ? 'checkin' : 'checkout';
              updateStudentHistory(studentId, action);
              mapTagToStudent(tagId, studentId);
            }

            // Update session activity
            try {
              await api.updateSessionActivity(authenticatedUser.pin);
              logger.debug('Session activity updated during background sync');
            } catch (error) {
              logger.warn('Failed to update session activity during sync', { error });
            }
          } catch (syncError) {
            logger.warn('Background sync failed, queuing for retry', {
              error: syncError instanceof Error ? syncError.message : String(syncError),
              syncTime: Date.now() - startTime,
            });

            // Queue failed operation for retry when network recovers
            const operationId = queueFailedScan(
              tagId,
              'checkin', // Server will determine actual action
              selectedRoom.id,
              authenticatedUser.pin
            );

            logger.info('Scan queued for background sync', { operationId, tagId });
          }
        })();

        // Execute the promise in background (don't block)
        void syncPromise;

        // Update the tag scan record with the sync promise (for race condition prevention)
        recordTagScan(tagId, {
          timestamp: Date.now(),
          studentId: cachedStudent.id.toString(),
          result: cachedResult,
          syncPromise,
        });

        // Clean up modal after display time
        setTimeout(() => {
          hideScanModal();
        }, rfid.modalDisplayTime);
      } else {
        // CACHE MISS - Use existing network-based flow but add to cache
        logger.info('CACHE MISS: No cached data found, using network call', {
          tagId,
          responseTime: Date.now() - startTime,
        });

        // 1. IMMEDIATE OPTIMISTIC UI FEEDBACK (existing logic)
        const optimisticScan = {
          id: scanId,
          tagId,
          status: 'pending' as const,
          optimisticAction: 'checkin' as const,
          optimisticStudentCount: 0,
          timestamp: Date.now(),
          studentInfo: {
            name: 'Processing...', // Placeholder while API loads
            id: 0,
          },
        };

        // Show immediate visual feedback
        addOptimisticScan(optimisticScan);
        showScanModal();
        logger.info('Showed immediate optimistic feedback for cache miss');

        // 2. NETWORK API CALL
        try {
          // Update status to processing
          updateOptimisticScan(scanId, 'processing');

          // Call the API to process the scan
          const result = await api.processRfidScan(
            {
              student_rfid: tagId,
              action: 'checkin',
              room_id: selectedRoom.id,
            },
            authenticatedUser.pin
          );

          logger.info(`Network scan completed: ${result.action} for ${result.student_name}`, {
            networkTime: Date.now() - startTime,
          });

          // 3. UPDATE UI WITH REAL RESULTS
          updateOptimisticScan(scanId, 'success');
          setScanResult(result);

          // Check if this is a supervisor scan
          if (result.action === 'supervisor_authenticated') {
            // Supervisor scan - show result, no caching/history
            logger.info('Supervisor authenticated (network path)', {
              supervisorName: result.student_name,
              message: result.message,
            });

            // Clean up after modal display time
            setTimeout(() => {
              hideScanModal();
              removeOptimisticScan(scanId);
            }, rfid.modalDisplayTime);

            // Skip student-specific logic
            return;
          }

          // 4. ADD TO CACHE for future instant access
          void cacheStudentData(tagId, result, {
            room: result.room_name ?? selectedRoom.name,
            activity: selectedActivity?.name,
          });

          // Update all tracking mechanisms
          if (result.student_id) {
            const studentId = result.student_id.toString();
            const action = result.action === 'checked_in' ? 'checkin' : 'checkout';

            // Map tag to student for future lookups
            mapTagToStudent(tagId, studentId);

            // Update student history
            updateStudentHistory(studentId, action);

            // Cache the scan result for 2 seconds (existing logic)
            recordTagScan(tagId, {
              timestamp: Date.now(),
              studentId,
              result,
            });
          }

          // Update session activity to prevent timeout
          try {
            await api.updateSessionActivity(authenticatedUser.pin);
            logger.debug('Session activity updated');
          } catch (error) {
            logger.warn('Failed to update session activity', { error });
          }

          // Clean up after modal display time
          setTimeout(() => {
            hideScanModal();
            removeOptimisticScan(scanId);
          }, rfid.modalDisplayTime);
        } catch (error) {
          logger.error('Failed to process RFID scan', { error });

          // ERROR HANDLING - Show real errors to users
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes('already has an active visit')) {
            // This is an info state, not an error - student is already checked in
            logger.info('Student already has active visit - showing info to user');
            updateOptimisticScan(scanId, 'failed');

            // Show informative message (not success!)
            const infoResult: ExtendedRfidScanResult = {
              student_name: 'Already Checked In',
              student_id: 0,
              action: 'already_in',
              message: 'This student is already checked into this room',
              isInfo: true,
            };
            setScanResult(infoResult as RfidScanResult);
          } else {
            // Real error
            updateOptimisticScan(scanId, 'failed');
            const errorResult: ExtendedRfidScanResult = {
              student_name: 'Scan Failed',
              student_id: 0,
              action: 'error',
              message: errorMessage || 'Please try again',
              showAsError: true,
            };
            setScanResult(errorResult as RfidScanResult);
          }

          // Show modal with error/info state
          showScanModal();

          // Clean up after display
          setTimeout(() => {
            hideScanModal();
            removeOptimisticScan(scanId);
          }, rfid.modalDisplayTime);
        }
      }

      // Always clean up processing queue
      removeFromProcessingQueue(tagId);
    },
    [
      authenticatedUser,
      selectedRoom,
      selectedActivity,
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
      getCachedStudentData,
      cacheStudentData,
      rfid.modalDisplayTime,
      rfid.recentTagScans,
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
    }
  }, [isTagBlocked, processScan]);

  const startScanning = useCallback(async () => {
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
      logger.info('Starting RFID background service');
      await safeInvoke('start_rfid_service');
      isServiceStartedRef.current = true;
      startRfidScanning(); // Update store state
      logger.info('RFID background service started');
    } catch (error) {
      logger.error('Failed to start RFID service', { error });
    }
  }, [startRfidScanning, isTagBlocked, processScan]);

  const stopScanning = useCallback(async () => {
    if (!isServiceStartedRef.current) {
      logger.debug('Service not running, but ensuring store state is synchronized');
      // Even if service is not tracked as running, update store state
      stopRfidScanning();
      return;
    }

    try {
      if (isRfidEnabled()) {
        logger.info('Stopping RFID background service');
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
      logger.info('RFID service stopped');
    } catch (error) {
      logger.error('Failed to stop RFID service', { error });
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

    // Load student cache for offline operation
    void loadStudentCache();
    logger.info('Student cache loading initiated for offline scanning');
  }, [initializeService, setupEventListener, syncServiceState, loadStudentCache]);

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
