/**
 * Store logger configuration for PyrePortal
 *
 * This file provides configuration options specific to Zustand store logging
 * and can be used to adjust logging behavior at runtime.
 */
import { LogLevel } from './logger';
import type { LoggerMiddlewareOptions } from './storeMiddleware';

// Default configuration for production
const defaultStoreLogConfig: LoggerMiddlewareOptions = {
  name: 'ZustandStore',
  enabled: true,
  logLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  activityTracking: true,
  stateChanges: true,
  actionSource: true,
  // Exclude actions that might create noise
  excludedActions: ['functionalUpdate'],
};

// Verbose configuration for development and debugging
const verboseStoreLogConfig: LoggerMiddlewareOptions = {
  ...defaultStoreLogConfig,
  logLevel: LogLevel.DEBUG,
  stateChanges: true,
  // Track everything
  excludedActions: [],
};

// Production configuration - focus on activity issues
const productionStoreLogConfig: LoggerMiddlewareOptions = {
  ...defaultStoreLogConfig,
  logLevel: LogLevel.INFO,
  // Focus only on activity tracking in production
  stateChanges: false,
};

// Export current configuration based on environment
export const storeLogConfig: LoggerMiddlewareOptions = import.meta.env.PROD
  ? productionStoreLogConfig
  : import.meta.env.DEV
    ? verboseStoreLogConfig
    : defaultStoreLogConfig;

// Helper functions for managing store logging behavior at runtime
export const enableVerboseStoreLogging = (): void => {
  localStorage.setItem('pyrePortalVerboseStoreLogging', 'true');
};

export const disableVerboseStoreLogging = (): void => {
  localStorage.setItem('pyrePortalVerboseStoreLogging', 'false');
};

export const isVerboseStoreLoggingEnabled = (): boolean => {
  return localStorage.getItem('pyrePortalVerboseStoreLogging') === 'true';
};

// Return runtime configuration with any user preferences
export const getRuntimeStoreLogConfig = (): LoggerMiddlewareOptions => {
  const config = { ...storeLogConfig };

  // Override with verbose settings if enabled manually
  if (isVerboseStoreLoggingEnabled()) {
    config.logLevel = LogLevel.DEBUG;
    config.stateChanges = true;
    config.excludedActions = [];
  }

  return config;
};

// Sample interpretation helper for activity name changes
export const analyzeActivityNameChange = (
  logs: Array<{
    actionId: number;
    prevName: string;
    nextName: string;
    source: string;
    timestamp: string;
  }>
): string => {
  if (!logs || logs.length === 0) {
    return 'No activity name changes detected.';
  }

  const sources = new Set(logs.map(log => log.source));
  const timeSpan =
    logs.length > 1
      ? `${new Date(logs[0].timestamp).toLocaleTimeString()} - ${new Date(logs[logs.length - 1].timestamp).toLocaleTimeString()}`
      : new Date(logs[0].timestamp).toLocaleTimeString();

  return (
    `Found ${logs.length} activity name changes between ${timeSpan}.\n` +
    `Changes originated from ${sources.size} different sources: ${Array.from(sources).join(', ')}.\n` +
    `Most recent change: "${logs[logs.length - 1].prevName || '(empty)'}" → "${logs[logs.length - 1].nextName || '(empty)'}"`
  );
};
