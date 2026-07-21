/**
 * Zustand store logging middleware for PyrePortal
 *
 * This middleware provides detailed logging for Zustand store state changes
 * and state transitions.
 */
import type { StoreApi } from 'zustand';

import { createLogger, LogLevel } from './logger';

// Counter for unique action IDs
let actionCounter = 0;

/**
 * Handle diff for regular array state changes
 */
const handleArrayDiff = (
  prevValue: unknown[],
  nextValue: unknown[]
): Record<string, unknown> | null => {
  if (prevValue.length === nextValue.length) {
    return null;
  }

  return {
    type: 'array',
    count: {
      prev: prevValue.length,
      next: nextValue.length,
    },
  };
};

/**
 * Check if a value should be skipped in diff calculation
 */
const shouldSkipValue = (prevValue: unknown, nextValue: unknown): boolean => {
  return (
    typeof nextValue === 'function' || typeof prevValue === 'function' || prevValue === nextValue
  );
};

/**
 * Process a single key and return its diff entry, or null if no change
 */
const processKeyDiff = <T extends Record<string, unknown>>(
  key: string,
  prevState: T,
  nextState: T
): Record<string, unknown> | null => {
  const prevValue = prevState[key];
  const nextValue = nextState[key];

  if (shouldSkipValue(prevValue, nextValue)) {
    return null;
  }

  // Handle added keys
  if (!(key in prevState)) {
    return { added: true, value: nextValue };
  }

  // Handle removed keys
  if (!(key in nextState)) {
    return { removed: true, value: prevValue };
  }

  // Handle regular arrays
  if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
    return handleArrayDiff(prevValue, nextValue);
  }

  // Default case for primitive values
  return { prev: prevValue, next: nextValue };
};

/**
 * Helper to generate a deep diff between two state objects
 * Only includes properties that have actually changed
 */
const getStateDiff = <T extends Record<string, unknown>>(
  prevState: T,
  nextState: T
): Record<string, unknown> => {
  const diff: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(prevState), ...Object.keys(nextState)]);

  for (const key of allKeys) {
    const keyDiff = processKeyDiff(key, prevState, nextState);
    if (keyDiff) {
      diff[key] = keyDiff;
    }
  }

  return diff;
};

/**
 * Attempt to extract a meaningful action name from the set arguments
 */
const getActionName = (args: unknown): string => {
  // For function updates (setState(prev => ...))
  if (typeof args === 'function') {
    return (args as { name?: string }).name ?? 'functionalUpdate';
  }

  // For redux-style actions with type
  if (args && typeof args === 'object' && 'type' in args) {
    return String(args.type);
  }

  // For plain object updates, summarize the fields being changed
  if (args && typeof args === 'object') {
    const keys = Object.keys(args);
    if (keys.length === 1) {
      return `set:${keys[0]}`;
    }
    return `setMultiple:${keys.length}Fields`;
  }

  return 'unknownAction';
};

/**
 * Check if a stack line is from internal middleware or Zustand
 */
const isInternalStackLine = (line: string): boolean => {
  return line.includes('node_modules/zustand') || line.includes('storeMiddleware.ts');
};

/**
 * Extract file name from a cleaned location string.
 * Uses a non-backtracking approach: find the last path separator,
 * then extract the filename portion before the line:column suffix.
 */
const extractFileName = (location: string): string => {
  // Find the last path separator
  const lastSlash = Math.max(location.lastIndexOf('/'), location.lastIndexOf('\\'));
  const fileWithLineCol = lastSlash >= 0 ? location.slice(lastSlash + 1) : location;

  // Extract filename before :line:column suffix
  const colonIndex = fileWithLineCol.indexOf(':');
  if (colonIndex > 0) {
    return fileWithLineCol.slice(0, colonIndex);
  }

  return fileWithLineCol;
};

/**
 * Parse a stack trace line and return formatted caller info
 */
const parseStackLine = (line: string): string => {
  const match = /at\s(.+?)\s\((.+?)\)/.exec(line) ?? /at\s(.+)/.exec(line);

  if (!match) {
    return line.replace(/^at\s/, '');
  }

  const [, fnName, location = ''] = match;
  const cleanedLocation = location.replace(/webpack-internal:\/\/\//, '');

  if (cleanedLocation) {
    const fileName = extractFileName(cleanedLocation);
    return `${fnName} (${fileName})`;
  }

  return fnName;
};

/**
 * Extract caller information from the stack trace
 * This helps identify which component/function triggered a state change
 */
const getCallerInfo = (): string => {
  try {
    const stack = new Error('stack trace').stack ?? '';
    const stackLines = stack.split('\n');

    // Skip the first few lines related to this middleware
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i].trim();

      if (!isInternalStackLine(line)) {
        return parseStackLine(line);
      }
    }

    return 'unknown';
  } catch {
    return 'error';
  }
};

/**
 * Configuration options for the logger middleware
 */
interface LoggerMiddlewareOptions {
  // Store name for identification in logs
  name?: string;

  // Enable/disable the entire middleware
  enabled?: boolean;

  // Log level to use for regular state changes
  logLevel?: LogLevel;

  // Log all state changes
  stateChanges?: boolean;

  // Include the source component/function
  actionSource?: boolean;

  // Include only specific actions
  includedActions?: string[];

  // Exclude specific actions
  excludedActions?: string[];

  // Custom filter function for actions
  actionFilter?: (actionName: string) => boolean;

  // Custom filter for state changes
  stateFilter?: <T>(prevState: T, nextState: T, changes: Record<string, unknown>) => boolean;
}

/**
 * Default configuration options
 */
const defaultOptions: LoggerMiddlewareOptions = {
  name: 'store',
  enabled: true,
  logLevel: LogLevel.DEBUG,
  stateChanges: true,
  actionSource: true,
  includedActions: [],
  excludedActions: [],
};

// Define types for Zustand set and get functions
type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>), replace?: false) => void;

type GetState<T> = () => T;

// Define StateCreator type to match Zustand's definition
type StateCreator<T> = (set: SetState<T>, get: GetState<T>, api: StoreApi<T>) => T;

/**
 * Zustand middleware for comprehensive store logging
 * Tracks state changes, action sources, and provides
 * special handling for activity-related state.
 */
export const loggerMiddleware =
  <T>(config: StateCreator<T>, options?: LoggerMiddlewareOptions): StateCreator<T> =>
  (set: SetState<T>, get: GetState<T>, api: StoreApi<T>) => {
    const {
      name,
      enabled,
      logLevel,
      stateChanges,
      actionSource,
      includedActions,
      excludedActions,
      actionFilter,
      stateFilter,
    } = { ...defaultOptions, ...options };

    // Skip middleware entirely if disabled
    if (!enabled) {
      return config(set, get, api);
    }

    // Create a dedicated logger for this store
    const storeLogger = createLogger(name ?? 'store');

    // Pre-compute whether the log level would actually be emitted.
    // This avoids expensive diff/stack-trace work when the logger would discard the message.
    const stateChangeLevel = logLevel ?? LogLevel.DEBUG;
    const wouldLogStateChanges = stateChanges && storeLogger.wouldLog(stateChangeLevel);

    // Enhance the state setter function
    return config(
      args => {
        // Fast path: if nothing would be logged, just apply the update
        if (!wouldLogStateChanges) {
          set(args);
          return;
        }

        // Full logging path: state change logging is active (dev mode or debug override)
        const actionName = getActionName(args);

        // Apply action filtering
        const shouldLog =
          // Include all actions if no specific includes
          (includedActions?.length === 0 || includedActions?.includes(actionName)) &&
          // Exclude specified actions
          !excludedActions?.includes(actionName) &&
          // Apply custom filter if provided
          (!actionFilter || actionFilter(actionName));

        // Skip logging but still apply the state change
        if (!shouldLog) {
          set(args);
          return;
        }

        // Get current state before update
        const prevState = get();

        // Apply the state update
        set(args);

        // Get state after update
        const nextState = get();

        // Generate diff of changed state
        const changes = getStateDiff(
          prevState as unknown as Record<string, unknown>,
          nextState as unknown as Record<string, unknown>
        );

        // Skip logging if no meaningful changes detected
        if (Object.keys(changes).length === 0) {
          return;
        }

        const actionId = ++actionCounter;
        const timestamp = new Date();

        // Capture caller information if enabled (after filtering to avoid unnecessary stack trace parsing)
        let callerInfo = '';
        if (actionSource) {
          callerInfo = getCallerInfo();
        }

        // Apply custom state filter if provided
        if (stateFilter && !stateFilter(prevState, nextState, changes)) {
          return;
        }

        // Standard state change logging
        const logPayload = {
          actionId,
          actionName,
          changes,
          timestamp: timestamp.toISOString(),
          ...(callerInfo ? { source: callerInfo } : {}),
        };
        const logMessage = 'State updated';

        // Use the appropriate public logging method based on level
        switch (stateChangeLevel) {
          case LogLevel.INFO:
            storeLogger.info(logMessage, logPayload);
            break;
          case LogLevel.WARN:
            storeLogger.warn(logMessage, logPayload);
            break;
          case LogLevel.ERROR:
            storeLogger.error(logMessage, logPayload);
            break;
          case LogLevel.DEBUG:
          default:
            storeLogger.debug(logMessage, logPayload);
        }
      },
      get,
      api
    );
  };
