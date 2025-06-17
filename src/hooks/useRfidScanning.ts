import { useEffect, useRef, useCallback } from 'react';

import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

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
    blockTag,
    isTagBlocked,
    showScanModal,
    hideScanModal,
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

      try {
        logger.info(`Processing RFID scan for tag: ${tagId}`);

        // Call the API to process the scan
        const result = await api.processRfidScan(
          {
            student_rfid: tagId,
            action: 'checkin',
            room_id: selectedRoom.id,
          },
          authenticatedUser.pin
        );

        logger.info(`Scan result: ${result.action} for ${result.student_name}`);

        // Debug: Log the complete result to see what server returned
        logger.debug('Complete RFID scan result', {
          action: result.action,
          actionType: typeof result.action,
          actionLength: result.action?.length,
          actionCharCodes: result.action ? Array.from(result.action).map(c => c.charCodeAt(0)) : [],
          isCheckedIn: result.action === 'checked_in',
          isCheckedOut: result.action === 'checked_out',
          student_name: result.student_name,
          student_id: result.student_id,
          visit_id: result.visit_id,
          message: result.message,
          status: result.status,
          fullResult: JSON.stringify(result),
        });

        // Update store with scan result and show modal
        setScanResult(result);
        showScanModal();

        // Block the tag for the configured timeout
        blockTag(tagId, rfid.scanTimeout);

        // Update session activity to prevent timeout
        try {
          await api.updateSessionActivity(authenticatedUser.pin);
          logger.debug('Session activity updated');
        } catch (error) {
          logger.warn('Failed to update session activity', { error });
        }

        // Hide modal after display time
        setTimeout(() => {
          hideScanModal();
        }, rfid.modalDisplayTime);
      } catch (error) {
        logger.error('Failed to process RFID scan', { error });
        // Could show error modal here
      }
    },
    [
      authenticatedUser,
      selectedRoom,
      setScanResult,
      showScanModal,
      blockTag,
      rfid.scanTimeout,
      rfid.modalDisplayTime,
      hideScanModal,
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
      logger.debug('Service already started, skipping');
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
      logger.debug('Service not running, skipping');
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
    }
  }, [stopRfidScanning]);

  // Initialize service and setup event listener on mount
  useEffect(() => {
    void initializeService();
    void setupEventListener();
  }, [initializeService, setupEventListener]);

  // Auto-restart scanning after modal hides
  useEffect(() => {
    if (!rfid.showModal && rfid.isScanning && !isServiceStartedRef.current) {
      logger.debug('Modal closed, restarting scanning');
      void startScanning();
    }
  }, [rfid.showModal, rfid.isScanning, startScanning]);

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
