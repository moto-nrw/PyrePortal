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
 * Helper to generate a deep diff between two state objects
 * Only includes properties that have actually changed
 */
const getStateDiff = <T extends Record<string, unknown>>(prevState: T, nextState: T): Record<string, unknown> => {
  const diff: Record<string, unknown> = {};
  
  // Track all keys from both objects
  const allKeys = new Set([
    ...Object.keys(prevState),
    ...Object.keys(nextState)
  ]);
  
  // Process each key
  allKeys.forEach(key => {
    // Skip functions and unchanged values
    if (
      typeof nextState[key] === 'function' || 
      typeof prevState[key] === 'function' || 
      prevState[key] === nextState[key]
    ) {
      return;
    }
    
    // Track new or deleted keys
    if (!(key in prevState)) {
      diff[key] = {
        added: true,
        value: nextState[key]
      };
      return;
    }
    
    if (!(key in nextState)) {
      diff[key] = {
        removed: true,
        value: prevState[key]
      };
      return;
    }
    
    // Handle special cases for certain state types
    
    // Activity tracking
    if (key === 'currentActivity') {
      const prevActivity = prevState[key] ?? {};
      const nextActivity = nextState[key] ?? {};
      
      // Only include activities if they're actually different objects
      if (prevActivity !== nextActivity) {
        const activityDiff: Record<string, unknown> = {};
        
        // Focus on fields of interest
        ['id', 'name', 'category', 'roomId', 'supervisorId'].forEach(field => {
          const typedPrevActivity = prevActivity as Record<string, unknown>;
          const typedNextActivity = nextActivity as Record<string, unknown>;
          
          if (typedPrevActivity[field] !== typedNextActivity[field]) {
            activityDiff[field] = {
              prev: typedPrevActivity[field],
              next: typedNextActivity[field]
            };
          }
        });
        
        if (Object.keys(activityDiff).length > 0) {
          diff[key] = activityDiff;
        }
      }
      return;
    }
    
    // Activities array
    if (key === 'activities') {
      const prevActivities = prevState[key] ?? [];
      const nextActivities = nextState[key] ?? [];
      
      // Compare array length changes
      if (Array.isArray(prevActivities) && Array.isArray(nextActivities) && 
          prevActivities.length !== nextActivities.length) {
        diff[key] = {
          count: {
            prev: prevActivities.length,
            next: nextActivities.length
          }
        };
        
        // If activities were added, show the new ones
        if (nextActivities.length > prevActivities.length) {
          // Use type assertion to ensure newActivity is properly typed
          const newActivity: unknown = nextActivities[nextActivities.length - 1];
          if (newActivity && typeof newActivity === 'object') {
            const activityRecord = newActivity as Record<string, unknown>;
            const safeAddedInfo = {
              id: 'id' in activityRecord ? activityRecord.id : undefined,
              name: 'name' in activityRecord ? activityRecord.name : undefined
            };
            
            diff[key] = {
              ...(diff[key] as Record<string, unknown>),
              added: safeAddedInfo
            };
          }
        }
      }
      return;
    }
    
    // Regular arrays - compare length
    if (Array.isArray(prevState[key]) && Array.isArray(nextState[key])) {
      if (prevState[key].length !== nextState[key].length) {
        diff[key] = {
          type: 'array',
          count: {
            prev: prevState[key].length,
            next: nextState[key].length
          }
        };
      }
      return;
    }
    
    // Default case for primitive values
    diff[key] = {
      prev: prevState[key],
      next: nextState[key]
    };
  });
  
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
 * Extract caller information from the stack trace
 * This helps identify which component/function triggered a state change
 */
const getCallerInfo = (): string => {
  try {
    const stack = new Error().stack ?? '';
    const stackLines = stack.split('\n');
    
    // Skip the first few lines related to this middleware
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i].trim();
      
      // Skip internal Zustand calls and middleware functions
      if (
        !line.includes('node_modules/zustand') && 
        !line.includes('storeMiddleware.ts')
      ) {
        // Extract the most useful part of the stack trace line
        const match = (/at\s(.+?)\s\((.+?)\)/.exec(line)) ?? 
                      (/at\s(.+)/.exec(line));
        
        if (match) {
          const [, fnName, location] = [...match, ''];
          const cleanedLocation = location.replace(/webpack-internal:\/\/\//, '');
          
          if (cleanedLocation) {
            // Extract just the file name without the path
            const fileMatch = /([^/\\]+):\d+:\d+$/.exec(cleanedLocation);
            const fileName = fileMatch ? fileMatch[1] : cleanedLocation;
            return `${fnName} (${fileName})`;
          }
          
          return fnName;
        }
        
        return line.replace(/^at\s/, '');
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
  excludedActions: []
};

// Define types for Zustand set and get functions
type SetState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: false  
) => void;

type GetState<T> = () => T;

// Define StateCreator type to match Zustand's definition
type StateCreator<T> = (
  set: SetState<T>,
  get: GetState<T>,
  api: StoreApi<T>
) => T;

/**
 * Zustand middleware for comprehensive store logging
 * Tracks state changes, action sources, and provides
 * special handling for activity-related state.
 */
export const loggerMiddleware = <T>(
  config: StateCreator<T>,
  options?: LoggerMiddlewareOptions
): StateCreator<T> => 
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
      stateFilter
    } = { ...defaultOptions, ...options };

    // Skip middleware entirely if disabled
    if (!enabled) {
      return config(set, get, api);
    }

    // Create a dedicated logger for this store
    const storeLogger = createLogger(name ?? 'store');
    
    // Enhance the state setter function
    return config(
      (args) => {
        const actionId = ++actionCounter;
        const timestamp = new Date();
        const actionName = getActionName(args);
        
        // Apply action filtering
        const shouldLog = (
          // Include all actions if no specific includes
          (includedActions?.length === 0 || includedActions?.includes(actionName)) &&
          // Exclude specified actions
          !excludedActions?.includes(actionName) &&
          // Apply custom filter if provided
          (!actionFilter || actionFilter(actionName))
        );
        
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
          // Use the appropriate public logging method based on level
          switch (level) {
            case LogLevel.DEBUG:
              storeLogger.debug(`[${actionId}] State updated: ${actionName}`, {
                changes,
                timestamp: timestamp.toISOString(),
                ...(callerInfo ? { source: callerInfo } : {}),
              });
              break;
            case LogLevel.INFO:
              storeLogger.info(`[${actionId}] State updated: ${actionName}`, {
                changes,
                timestamp: timestamp.toISOString(),
                ...(callerInfo ? { source: callerInfo } : {}),
              });
              break;
            case LogLevel.WARN:
              storeLogger.warn(`[${actionId}] State updated: ${actionName}`, {
                changes,
                timestamp: timestamp.toISOString(),
                ...(callerInfo ? { source: callerInfo } : {}),
              });
              break;
            case LogLevel.ERROR:
              storeLogger.error(`[${actionId}] State updated: ${actionName}`, {
                changes,
                timestamp: timestamp.toISOString(),
                ...(callerInfo ? { source: callerInfo } : {}),
              });
              break;
            default:
              storeLogger.debug(`[${actionId}] State updated: ${actionName}`, {
                changes,
                timestamp: timestamp.toISOString(),
                ...(callerInfo ? { source: callerInfo } : {}),
              });
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
  return create<T>(
    loggerMiddleware(storeCreator, options)
  );
};