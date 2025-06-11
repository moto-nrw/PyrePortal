import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';

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

  const scanLoopRef = useRef<boolean>(false);
  const isScanningRef = useRef<boolean>(false);

  const processScan = useCallback(async (tagId: string) => {
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
  }, [authenticatedUser, selectedRoom, setScanResult, showScanModal, blockTag, rfid.scanTimeout, rfid.modalDisplayTime, hideScanModal]);

  const scanLoop = useCallback(async () => {
    logger.debug('Starting scan loop');
    let scanCount = 0;
    
    while (scanLoopRef.current) {
      try {
        scanCount++;
        if (scanCount % 10 === 0) {
          logger.debug(`Scan loop still running, scan count: ${scanCount}`);
        }
        
        // Use Tauri command to scan for RFID with timeout
        const result = await invoke<{ success: boolean; tag_id: string | null; error: string | null }>('scan_rfid_with_timeout', {
          timeoutSeconds: 1 // 1 second timeout
        });
        
        if (result.error) {
          // Only log if it's not a timeout error (which is expected when no card is present)
          if (!result.error.includes('timeout') && !result.error.includes('no card detected')) {
            logger.debug('RFID scan returned error', { error: result.error });
          }
        }
        
        const tagId = result.success ? result.tag_id : null;
        
        if (tagId) {
          if (!isTagBlocked(tagId)) {
            logger.info(`Tag detected: ${tagId}`);
            await processScan(tagId);
          } else {
            logger.debug(`Tag ${tagId} is blocked, skipping`);
          }
        }
      } catch (error) {
        // Timeout or error - continue scanning
        logger.error('RFID scan failed with exception', { error });
      }
      
      // Small delay to prevent CPU overuse
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    logger.info(`Scanning loop ended after ${scanCount} scans`);
    scanLoopRef.current = false;
  }, [isTagBlocked, processScan]);

  const startScanning = useCallback(() => {
    if (!scanLoopRef.current) {
      logger.info('Starting RFID scanning');
      scanLoopRef.current = true;
      isScanningRef.current = true;
      startRfidScanning();
      void scanLoop();
    } else {
      logger.debug('Scanning already in progress, skipping');
    }
  }, [startRfidScanning, scanLoop]);

  const stopScanning = useCallback(() => {
    logger.info('Stopping RFID scanning');
    scanLoopRef.current = false;
    isScanningRef.current = false;
    stopRfidScanning();
  }, [stopRfidScanning]);

  // Auto-restart scanning after modal hides
  useEffect(() => {
    if (!rfid.showModal && rfid.isScanning && !scanLoopRef.current) {
      logger.debug('Modal closed, restarting scanning');
      startScanning();
    }
  }, [rfid.showModal, rfid.isScanning, startScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scanLoopRef.current = false;
    };
  }, []);

  return {
    isScanning: rfid.isScanning,
    currentScan: rfid.currentScan,
    showModal: rfid.showModal,
    startScanning,
    stopScanning,
  };
};