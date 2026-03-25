import { useEffect } from 'react';

import { adapter } from '@platform';

import { createLogger, serializeError } from '../utils/logger';
import { isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('RfidServiceInitializer');

/**
 * True when real NFC/RFID hardware should be initialized.
 * GKT always uses real NFC via system.js, Tauri depends on VITE_ENABLE_RFID.
 */
const isRealScanningEnabled = (): boolean => adapter.platform === 'gkt' || isRfidEnabled();

export const RfidServiceInitializer = () => {
  useEffect(() => {
    const initializeRfidService = async () => {
      if (!isRealScanningEnabled()) {
        logger.info('RFID hardware not enabled, skipping service initialization');
        return;
      }

      try {
        logger.info('Initializing RFID service at app startup');
        await adapter.initializeNfc();
        logger.info('RFID service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize RFID service at startup', {
          error: serializeError(error),
        });
      }
    };

    void initializeRfidService();
  }, []);

  // This component doesn't render anything
  return null;
};
