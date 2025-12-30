import { useState, useEffect, useCallback, useRef } from 'react';

import type { NetworkStatusData } from '../components/ui/NetworkStatus';
import { api } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useNetworkStatus');

// Threshold for "poor" quality (in milliseconds)
// Below this = online, above this = poor, failed = offline
const POOR_THRESHOLD_MS = 1000;

const CHECK_INTERVAL = 30000; // Check every 30 seconds

export const useNetworkStatus = () => {
  // Network status state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusData>({
    isOnline: true,
    responseTime: 0,
    lastChecked: Date.now(),
    quality: 'online',
  });

  // Refs for cleanup
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef<boolean>(false);

  // Perform network connectivity check using unauthenticated health endpoint
  // This is the ONLY source of truth - no navigator.onLine, no browser events
  const checkNetworkStatus = useCallback(async (): Promise<NetworkStatusData> => {
    const startTime = Date.now();

    try {
      // Use unauthenticated health check endpoint
      await api.healthCheck();

      const responseTime = Date.now() - startTime;
      const quality: NetworkStatusData['quality'] =
        responseTime > POOR_THRESHOLD_MS ? 'poor' : 'online';

      logger.debug('Network check successful', {
        responseTime,
        quality,
      });

      return {
        isOnline: true,
        responseTime,
        lastChecked: Date.now(),
        quality,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.warn('Network check failed', {
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      });

      // Health check failed = offline
      return {
        isOnline: false,
        responseTime,
        lastChecked: Date.now(),
        quality: 'offline',
      };
    }
  }, []);

  // Perform network check and update state
  const performNetworkCheck = useCallback(async () => {
    // Prevent concurrent checks
    if (isCheckingRef.current) {
      logger.debug('Network check already in progress, skipping');
      return;
    }

    isCheckingRef.current = true;

    try {
      const status = await checkNetworkStatus();
      setNetworkStatus(status);

      logger.debug('Network status updated', {
        isOnline: status.isOnline,
        quality: status.quality,
        responseTime: status.responseTime,
      });
    } catch (error) {
      logger.error('Failed to check network status', { error });

      // Fallback to offline (health check itself failed unexpectedly)
      setNetworkStatus({
        isOnline: false,
        responseTime: 0,
        lastChecked: Date.now(),
        quality: 'offline',
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [checkNetworkStatus]);

  // Start monitoring network status
  const startMonitoring = useCallback(() => {
    // Perform initial check
    void performNetworkCheck();

    // Set up periodic checks
    if (!checkIntervalRef.current) {
      checkIntervalRef.current = setInterval(() => {
        void performNetworkCheck();
      }, CHECK_INTERVAL);

      logger.info('Network monitoring started', { checkInterval: CHECK_INTERVAL });
    }
  }, [performNetworkCheck]);

  // Stop monitoring network status
  const stopMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
      logger.info('Network monitoring stopped');
    }
  }, []);

  // Manual network check trigger
  const refreshNetworkStatus = useCallback(() => {
    logger.info('Manual network status refresh requested');
    void performNetworkCheck();
  }, [performNetworkCheck]);

  // Initialize monitoring on mount
  useEffect(() => {
    startMonitoring();

    // Cleanup on unmount
    return () => {
      stopMonitoring();
    };
  }, [startMonitoring, stopMonitoring]);

  return {
    networkStatus,
    refreshNetworkStatus,
    isChecking: isCheckingRef.current,
  };
};
