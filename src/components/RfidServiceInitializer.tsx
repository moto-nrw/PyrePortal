import { useEffect } from 'react';

import { adapter } from '@platform';

import { createLogger, serializeError } from '../utils/logger';
import { isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('RfidServiceInitializer');

export const RfidServiceInitializer = () => {
  useEffect(() => {
    const initializeRfidService = async () => {
      if (!isRfidEnabled()) {
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
