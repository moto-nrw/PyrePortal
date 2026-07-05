import { adapter } from '@platform';
import { useEffect } from 'react';

import { createLogger, serializeError } from '../utils/logger';

const logger = createLogger('RfidServiceInitializer');

/**
 * True when real NFC/RFID hardware should be initialized.
 * GKT always uses real NFC via system.js; browser and Tauri Mac/mock use mock scanning.
 */
const isRealScanningEnabled = (): boolean => adapter.platform === 'gkt';

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
