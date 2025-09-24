import { useState, useEffect, useCallback, useRef } from 'react';

import type { NetworkStatusData } from '../components/ui/NetworkStatus';
import { api } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useNetworkStatus');

// Network quality thresholds (in milliseconds)
const QUALITY_THRESHOLDS = {
  excellent: 500,   // < 500ms
  good: 1000,       // 500-1000ms
  poor: 2000,       // 1000-2000ms
  // > 2000ms = poor/timeout
};

const CHECK_INTERVAL = 30000; // Check every 30 seconds
const TIMEOUT_THRESHOLD = 5000; // Consider offline after 5 seconds

export const useNetworkStatus = () => {

  // Network status state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusData>({
    isOnline: navigator.onLine,
    responseTime: 0,
    lastChecked: Date.now(),
    quality: 'excellent',
  });

  // Refs for cleanup
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef<boolean>(false);

  // Determine quality based on response time and online status
  const determineQuality = useCallback((isOnline: boolean, responseTime: number): NetworkStatusData['quality'] => {
    if (!isOnline) return 'offline';

    if (responseTime < QUALITY_THRESHOLDS.excellent) return 'excellent';
    if (responseTime < QUALITY_THRESHOLDS.good) return 'good';
    return 'poor';
  }, []);

  // Perform network connectivity check using unauthenticated health endpoint
  const checkNetworkStatus = useCallback(async (): Promise<NetworkStatusData> => {
    const startTime = Date.now();
    const isOnline = navigator.onLine;

    // If browser thinks we're offline, don't bother with API call
    if (!isOnline) {
      return {
        isOnline: false,
        responseTime: 0,
        lastChecked: Date.now(),
        quality: 'offline',
      };
    }

    try {
      // Use unauthenticated health check endpoint
      await api.healthCheck();

      const responseTime = Date.now() - startTime;
      const quality = determineQuality(true, responseTime);

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

      // If it took too long, consider it poor connectivity rather than offline
      const isStillOnline = responseTime < TIMEOUT_THRESHOLD;

      logger.warn('Network check failed', {
        error: error instanceof Error ? error.message : String(error),
        responseTime,
        isStillOnline,
      });

      return {
        isOnline: isStillOnline,
        responseTime: isStillOnline ? responseTime : 0,
        lastChecked: Date.now(),
        quality: isStillOnline ? 'poor' : 'offline',
      };
    }
  }, [determineQuality]);

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

      // Fallback to basic online status
      setNetworkStatus({
        isOnline: navigator.onLine,
        responseTime: 0,
        lastChecked: Date.now(),
        quality: navigator.onLine ? 'excellent' : 'offline',
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [checkNetworkStatus]);

  // Handle browser online/offline events
  const handleOnlineStatusChange = useCallback(() => {
    const isOnline = navigator.onLine;
    logger.info('Browser online status changed', { isOnline });

    if (isOnline) {
      // When coming back online, immediately check actual connectivity
      void performNetworkCheck();
    } else {
      // When going offline, immediately update status
      setNetworkStatus(prev => ({
        ...prev,
        isOnline: false,
        quality: 'offline',
        lastChecked: Date.now(),
      }));
    }
  }, [performNetworkCheck]);

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

    // Listen to browser online/offline events
    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);
  }, [performNetworkCheck, handleOnlineStatusChange]);

  // Stop monitoring network status
  const stopMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
      logger.info('Network monitoring stopped');
    }

    window.removeEventListener('online', handleOnlineStatusChange);
    window.removeEventListener('offline', handleOnlineStatusChange);
  }, [handleOnlineStatusChange]);

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