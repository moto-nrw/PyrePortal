import { useEffect } from 'react';

import { createLogger } from '../utils/logger';
import { safeInvoke, isRfidEnabled } from '../utils/tauriContext';

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
        await safeInvoke('initialize_rfid_service');
        logger.info('RFID service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize RFID service at startup', { error });
      }
    };

    void initializeRfidService();
  }, []);

  // This component doesn't render anything
  return null;
};
