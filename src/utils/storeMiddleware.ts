/**
 * Zustand store logging middleware for PyrePortal
 *
 * This middleware provides detailed logging for Zustand store state changes,
 * with special attention to activity name tracking and state transitions.
 */
import { create } from 'zustand';
import type { StoreApi } from 'zustand';

import { createLogger, LogLevel } from './logger';

// Counter for unique action IDs
let actionCounter = 0;

/**
 * Fields of interest when tracking activity changes
 */
const ACTIVITY_TRACKED_FIELDS = ['id', 'name', 'category', 'roomId', 'supervisorId'] as const;

/**
 * Compare two activity objects and return the diff of tracked fields
 */
const getActivityDiff = (
  prevActivity: Record<string, unknown>,
  nextActivity: Record<string, unknown>
): Record<string, unknown> | null => {
  const activityDiff: Record<string, unknown> = {};

  for (const field of ACTIVITY_TRACKED_FIELDS) {
    if (prevActivity[field] !== nextActivity[field]) {
      activityDiff[field] = {
        prev: prevActivity[field],
        next: nextActivity[field],
      };
    }
  }

  return Object.keys(activityDiff).length > 0 ? activityDiff : null;
};

/**
 * Extract safe info from a newly added activity
 */
const extractAddedActivityInfo = (activity: unknown): { id: unknown; name: unknown } | null => {
  if (!activity || typeof activity !== 'object') {
    return null;
  }
  const activityRecord = activity as Record<string, unknown>;
  return {
    id: 'id' in activityRecord ? activityRecord.id : undefined,
    name: 'name' in activityRecord ? activityRecord.name : undefined,
  };
};

/**
 * Handle diff for currentActivity state changes
 */
const handleCurrentActivityDiff = (
  prevValue: unknown,
  nextValue: unknown
): Record<string, unknown> | null => {
  const prevActivity = (prevValue ?? {}) as Record<string, unknown>;
  const nextActivity = (nextValue ?? {}) as Record<string, unknown>;

  if (prevActivity === nextActivity) {
    return null;
  }

  return getActivityDiff(prevActivity, nextActivity);
};

/**
 * Handle diff for activities array state changes
 */
const handleActivitiesArrayDiff = (
  prevValue: unknown,
  nextValue: unknown
): Record<string, unknown> | null => {
  const prevActivities = prevValue ?? [];
  const nextActivities = nextValue ?? [];

  if (!Array.isArray(prevActivities) || !Array.isArray(nextActivities)) {
    return null;
  }

  if (prevActivities.length === nextActivities.length) {
    return null;
  }

  const result: Record<string, unknown> = {
    count: {
      prev: prevActivities.length,
      next: nextActivities.length,
    },
  };

  // If activities were added, show the new one
  if (nextActivities.length > prevActivities.length) {
    const addedInfo = extractAddedActivityInfo(nextActivities[nextActivities.length - 1]);
    if (addedInfo) {
      result.added = addedInfo;
    }
  }

  return result;
};

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
 * Handler map for special state keys
 */
const SPECIAL_KEY_HANDLERS: Record<
  string,
  (prev: unknown, next: unknown) => Record<string, unknown> | null
> = {
  currentActivity: handleCurrentActivityDiff,
  activities: handleActivitiesArrayDiff,
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
    const prevValue = prevState[key];
    const nextValue = nextState[key];

    if (shouldSkipValue(prevValue, nextValue)) {
      continue;
    }

    // Handle added keys
    if (!(key in prevState)) {
      diff[key] = { added: true, value: nextValue };
      continue;
    }

    // Handle removed keys
    if (!(key in nextState)) {
      diff[key] = { removed: true, value: prevValue };
      continue;
    }

    // Handle special keys with dedicated handlers
    const specialHandler = SPECIAL_KEY_HANDLERS[key];
    if (specialHandler) {
      const result = specialHandler(prevValue, nextValue);
      if (result) {
        diff[key] = result;
      }
      continue;
    }

    // Handle regular arrays
    if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
      const result = handleArrayDiff(prevValue, nextValue);
      if (result) {
        diff[key] = result;
      }
      continue;
    }

    // Default case for primitive values
    diff[key] = { prev: prevValue, next: nextValue };
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
  if (args && typeof args === 'object' && args !== null && 'type' in args) {
    return String((args as { type: unknown }).type);
  }

  // For plain object updates, summarize the fields being changed
  if (args && typeof args === 'object' && args !== null) {
    const keys = Object.keys(args as Record<string, unknown>);
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
 * Extract file name from a cleaned location string
 */
const extractFileName = (location: string): string => {
  const fileMatch = /([^/\\]+):\d+:\d+$/.exec(location);
  return fileMatch ? fileMatch[1] : location;
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
export interface LoggerMiddlewareOptions {
  // Store name for identification in logs
  name?: string;

  // Enable/disable the entire middleware
  enabled?: boolean;

  // Log level to use for regular state changes
  logLevel?: LogLevel;

  // Special logging for activity name changes
  activityTracking?: boolean;

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
  activityTracking: true,
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
      activityTracking,
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

    // Enhance the state setter function
    return config(
      args => {
        const actionId = ++actionCounter;
        const timestamp = new Date();
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

        // Capture caller information if enabled
        let callerInfo = '';
        if (actionSource) {
          callerInfo = getCallerInfo();
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

        // Apply custom state filter if provided
        if (stateFilter && !stateFilter(prevState, nextState, changes)) {
          return;
        }

        // Standard state change logging
        if (stateChanges) {
          const level = logLevel ?? LogLevel.DEBUG;
          const logPayload = {
            changes,
            timestamp: timestamp.toISOString(),
            ...(callerInfo ? { source: callerInfo } : {}),
          };
          const logMessage = `[${actionId}] State updated: ${actionName}`;

          // Use the appropriate public logging method based on level
          switch (level) {
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
        }

        // Special handling for activity name changes
        if (
          activityTracking &&
          changes.currentActivity &&
          typeof changes.currentActivity === 'object' &&
          changes.currentActivity !== null &&
          'name' in changes.currentActivity
        ) {
          const activityChanges = changes.currentActivity as Record<string, unknown>;
          const nameChanges = activityChanges.name as { prev: unknown; next: unknown } | undefined;

          if (nameChanges) {
            const prevName = nameChanges.prev;
            const nextName = nameChanges.next;

            const warningMessage = `[${actionId}] Activity name changed via ${actionName}`;
            storeLogger.warn(warningMessage, {
              prev: prevName,
              next: nextName,
              source: callerInfo,
              timestamp: timestamp.toISOString(),
            });
          }
        }
      },
      get,
      api
    );
  };

/**
 * Convenience function to create a store with logging middleware
 */
export const createStoreWithLogging = <T>(
  storeCreator: StateCreator<T>,
  options?: LoggerMiddlewareOptions
): StoreApi<T> => {
  return create<T>(loggerMiddleware(storeCreator, options));
};
