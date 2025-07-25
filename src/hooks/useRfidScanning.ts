import { useEffect, useRef, useCallback } from 'react';

import { api } from '../services/api';
import type { RfidScanResult } from '../services/api';
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
      
      // 1. IMMEDIATE OPTIMISTIC UI FEEDBACK (0ms delay)
      const optimisticScan = {
        id: scanId,
        tagId,
        status: 'pending' as const,
        optimisticAction: 'checkin' as const, // Will be determined by API
        optimisticStudentCount: 0, // Will be updated after API call
        timestamp: Date.now(),
        studentInfo: {
          name: 'Processing...', // Placeholder while API loads
          id: 0,
        },
      };

      // Show immediate visual feedback
      addOptimisticScan(optimisticScan);
      showScanModal();
      logger.info('Showed immediate optimistic feedback for scan');

      // 2. BACKGROUND API PROCESSING
      try {
        // Update status to processing
        updateOptimisticScan(scanId, 'processing');
        
        // Add to processing queue for tracking
        addToProcessingQueue(tagId);

        // Call the API to process the scan
        const result = await api.processRfidScan(
          {
            student_rfid: tagId,
            action: 'checkin',
            room_id: selectedRoom.id,
          },
          authenticatedUser.pin
        );

        logger.info(`Scan completed: ${result.action} for ${result.student_name}`);

        // 3. UPDATE UI WITH REAL RESULTS
        updateOptimisticScan(scanId, 'success');
        setScanResult(result);
        
        // Update all tracking mechanisms
        if (result.student_id) {
          const studentId = result.student_id.toString();
          const action = result.action === 'checked_in' ? 'checkin' : 'checkout';
          
          // Map tag to student for future lookups
          mapTagToStudent(tagId, studentId);
          
          // Update student history
          updateStudentHistory(studentId, action);
          
          // Cache the scan result for 2 seconds
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
        
        // 4. ERROR HANDLING - Show real errors to users
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('already has an active visit')) {
          // This is an info state, not an error - student is already checked in
          logger.info('Student already has active visit - showing info to user');
          updateOptimisticScan(scanId, 'failed');
          
          // Show informative message (not success!)
          const infoResult: ExtendedRfidScanResult = {
            student_name: "Already Checked In",
            student_id: 0,
            action: 'already_in',
            message: "This student is already checked into this room",
            isInfo: true,
          };
          setScanResult(infoResult as RfidScanResult);
          
          // Don't update student count or history for info states!
        } else {
          // Real error
          updateOptimisticScan(scanId, 'failed');
          const errorResult: ExtendedRfidScanResult = {
            student_name: "Scan Failed",
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
      } finally {
        // Always clean up processing queue
        removeFromProcessingQueue(tagId);
      }
    },
    [
      authenticatedUser,
      selectedRoom,
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
        mockScanInterval = setInterval(() => {
          // Get mock tags from environment variable or use defaults
          const envTags = import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined;
          const mockStudentTags: string[] = envTags 
            ? envTags.split(',').map((tag) => tag.trim())
            : [
                // Default realistic hardware format tags
                '04:D6:94:82:97:6A:80',
                '04:A7:B3:C2:D1:E0:F5',
                '04:12:34:56:78:9A:BC',
                '04:FE:DC:BA:98:76:54',
                '04:11:22:33:44:55:66'
              ];
          
          // Pick a random tag from the list
          const mockTagId = mockStudentTags[Math.floor(Math.random() * mockStudentTags.length)];
          
          logger.info('Mock RFID scan generated', {
            tagId: mockTagId,
            platform: 'Development Mock'
          });
          
          // Check if tag is blocked before processing
          if (!isTagBlocked(mockTagId)) {
            void processScan(mockTagId);
          } else {
            logger.debug(`Mock tag ${mockTagId} is blocked, skipping`);
          }
        }, 3000 + Math.random() * 2000); // Random interval between 3-5 seconds
        
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
