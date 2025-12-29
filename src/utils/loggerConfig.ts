/**
 * Logger configuration for PyrePortal application
 *
 * This file provides centralized configuration for the logging system
 * and can be adjusted for different environments.
 */
import { type LoggerConfig, LogLevel } from './logger';

// Default production configuration
const defaultConfig: LoggerConfig = {
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  persist: import.meta.env.PROD,
  persistLevel: LogLevel.WARN,
  maxInMemoryLogs: 1000,
  consoleOutput: true,
  contextInfo: {},
};

// Development configuration override
const devConfig: LoggerConfig = {
  ...defaultConfig,
  level: LogLevel.DEBUG,
  persist: false,
  maxInMemoryLogs: 5000,
};

// Test configuration override
const testConfig: LoggerConfig = {
  ...defaultConfig,
  level: LogLevel.NONE, // Disable logging in tests
  persist: false,
  consoleOutput: false,
};

// Get the appropriate configuration based on environment (avoids nested ternary - SonarCloud S3358)
const getEnvironmentConfig = (): LoggerConfig => {
  if (import.meta.env.TEST) {
    return testConfig;
  }
  if (import.meta.env.DEV) {
    return devConfig;
  }
  return defaultConfig;
};

// Configuration based on environment
const loggerConfig: LoggerConfig = getEnvironmentConfig();

// Check if debug logging was manually enabled via localStorage
const isDebugLoggingEnabled = (): boolean => {
  return localStorage.getItem('pyrePortalDebugLogging') === 'true';
};

// Get runtime configuration with any user preferences
export const getRuntimeConfig = (): LoggerConfig => {
  const config = { ...loggerConfig };

  // Override with user preferences if debug mode was manually enabled
  if (isDebugLoggingEnabled()) {
    config.level = LogLevel.DEBUG;
  }

  return config;
};
