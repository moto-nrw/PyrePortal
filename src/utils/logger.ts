/**
 * PyrePortal Frontend Logger
 *
 * A lightweight, configurable logging system for the PyrePortal application
 * with support for different log levels, contextual information, and persistence options.
 */

import { safeInvoke } from './tauriContext';

// Log levels in ascending order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4, // Used to disable logging
}

// Log entry structure
export interface LogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  sessionId: string;
}

// Logger configuration options
export interface LoggerConfig {
  level?: LogLevel;
  persist?: boolean;
  persistLevel?: LogLevel;
  maxInMemoryLogs?: number;
  consoleOutput?: boolean;
  contextInfo?: Record<string, unknown>;
}

// Default production configuration
const defaultConfig: LoggerConfig = {
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  persist: true,
  persistLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  maxInMemoryLogs: 1000,
  consoleOutput: true,
  contextInfo: {},
};

// Development configuration override
const devConfig: LoggerConfig = {
  ...defaultConfig,
  level: LogLevel.DEBUG,
  persist: true,
  persistLevel: LogLevel.DEBUG,
  maxInMemoryLogs: 5000,
};

// Test configuration override
const testConfig: LoggerConfig = {
  ...defaultConfig,
  level: LogLevel.NONE,
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

// Check if debug logging was manually enabled via localStorage
const isDebugLoggingEnabled = (): boolean => {
  return localStorage.getItem('pyrePortalDebugLogging') === 'true';
};

// Get runtime configuration with any user preferences
export const getRuntimeConfig = (): LoggerConfig => {
  const config = { ...getEnvironmentConfig() };

  // Override with user preferences if debug mode was manually enabled
  if (isDebugLoggingEnabled()) {
    config.level = LogLevel.DEBUG;
    config.persistLevel = LogLevel.DEBUG;
  }

  return config;
};

// Default configuration used by Logger constructor
const DEFAULT_CONFIG: LoggerConfig = getRuntimeConfig();

// Shared session ID across all logger instances
const SESSION_ID = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

/**
 * Serialize an error into a plain object safe for JSON.stringify
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { message: String(error) };
}

/**
 * Logger class for PyrePortal application
 */
export class Logger {
  private config: LoggerConfig;
  private readonly source: string;
  private readonly sessionId: string;
  private static inMemoryLogs: LogEntry[] = [];

  /**
   * Create a new logger instance
   *
   * @param source The source/component name for the logs
   * @param config Configuration options
   */
  constructor(source: string, config: LoggerConfig = {}) {
    this.source = source;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = SESSION_ID;
  }

  /**
   * Log a debug message
   *
   * @param message The message to log
   * @param data Additional data to include
   */
  public debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   *
   * @param message The message to log
   * @param data Additional data to include
   */
  public info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   *
   * @param message The message to log
   * @param data Additional data to include
   */
  public warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   *
   * @param message The message to log
   * @param data Additional data to include
   */
  public error(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Update logger configuration
   *
   * @param config New configuration options
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Retrieve in-memory logs
   *
   * @param level Optional minimum level to filter by
   * @returns Array of log entries
   */
  public getInMemoryLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return Logger.inMemoryLogs.filter(
        entry => LogLevel[entry.level as keyof typeof LogLevel] >= level
      );
    }
    return [...Logger.inMemoryLogs];
  }

  /**
   * Clear in-memory logs
   */
  public clearInMemoryLogs(): void {
    Logger.inMemoryLogs = [];
  }

  /**
   * Export logs to JSON string
   *
   * @param level Optional minimum level to filter by
   * @returns JSON string of logs
   */
  public exportLogs(level?: LogLevel): string {
    return JSON.stringify(this.getInMemoryLogs(level));
  }

  /**
   * Core logging implementation
   *
   * @param level Log level
   * @param message Message to log
   * @param data Additional data to include
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const consoleLevel = this.config.level!;
    const persistLvl = this.config.persistLevel!;

    // Skip if below both thresholds
    if (level < consoleLevel && level < persistLvl) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];

    // Create log entry
    const logEntry: LogEntry = {
      timestamp,
      level: levelName,
      source: this.source,
      message,
      sessionId: this.sessionId,
      ...(data && { data }),
      ...this.config.contextInfo,
    };

    // Store in memory (with circular buffer behavior)
    this.storeInMemory(logEntry);

    // Output to console if enabled and meets console level
    if (this.config.consoleOutput && level >= consoleLevel) {
      this.writeToConsole(level, logEntry);
    }

    // Persist if enabled and meets persist level
    if (this.config.persist && level >= persistLvl) {
      void this.persistLog(logEntry);
    }
  }

  /**
   * Store log in memory buffer
   *
   * @param logEntry The log entry to store
   */
  private storeInMemory(logEntry: LogEntry): void {
    Logger.inMemoryLogs.push(logEntry);

    // Maintain maximum log count using circular buffer logic
    if (Logger.inMemoryLogs.length > this.config.maxInMemoryLogs!) {
      Logger.inMemoryLogs.shift(); // Remove oldest entry
    }
  }

  /**
   * Write log to console with appropriate formatting
   *
   * @param level Log level
   * @param logEntry The log entry
   */
  private writeToConsole(level: LogLevel, logEntry: LogEntry): void {
    const { timestamp, source, message, data } = logEntry;
    const formattedMessage = `[${timestamp}] [${source}] ${message}`;

    switch (level) {
      case LogLevel.DEBUG:
        // eslint-disable-next-line no-console
        console.debug(formattedMessage, data ?? {});
        break;
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.info(formattedMessage, data ?? {});
        break;
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn(formattedMessage, data ?? {});
        break;
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error(formattedMessage, data ?? {});
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(formattedMessage, data ?? {});
    }
  }

  /**
   * Persist log entry using Tauri functionality
   *
   * @param logEntry The log entry to persist
   */
  private async persistLog(logEntry: LogEntry): Promise<void> {
    try {
      // Call Tauri command to write log to filesystem
      // Note: This requires implementing the corresponding Rust command
      await safeInvoke('write_log', {
        entry: JSON.stringify(logEntry),
      });
    } catch (error) {
      // Avoid recursive logging by writing directly to console
      // Only log if it's not a Tauri context issue
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!error || !errorMessage.includes('Tauri context not available')) {
        // eslint-disable-next-line no-console
        console.error('Failed to persist log:', errorMessage);
      }
    }
  }
}

/**
 * Create a logger for a specific component/module
 *
 * @param source The source/component name
 * @param config Optional configuration
 * @returns A configured logger instance
 */
export function createLogger(source: string, config?: LoggerConfig): Logger {
  return new Logger(source, config);
}

// Export a default app-level logger
export const logger = createLogger('App');

// Create higher-order logging functions for common scenarios
export const logUserAction = (action: string, details?: Record<string, unknown>): void => {
  logger.info('User action', { action, ...details });
};

export const logNavigation = (from: string, to: string, params?: Record<string, unknown>): void => {
  logger.info('Navigation', { from, to, ...params });
};

export const logError = (error: Error, context?: string): void => {
  logger.error('Unhandled error', {
    message: error.message,
    context,
    stack: error.stack,
    name: error.name,
  } as Record<string, unknown>);
};
