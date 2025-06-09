# PyrePortal State Management Logging Guide

This document provides guidance on using and interpreting the enhanced state logging capabilities in PyrePortal to diagnose issues, particularly focusing on activity name persistence problems.

## Overview

PyrePortal now includes comprehensive state tracking through a custom Zustand middleware that:

1. Logs all state changes with timestamps and source information
2. Provides special tracking for activity name updates
3. Identifies which component/function triggered state changes
4. Supports different log verbosity levels for development vs. production

## Log Format

The state middleware generates two primary types of logs:

### 1. State Change Logs

```
[DEBUG] [2023-05-14T10:25:13.456Z] [ZustandMiddleware] [42] State updated: set:selectedUser
  changes: {
    selectedUser: {
      prev: "",
      next: "Christian Kamann"
    }
  }
  timestamp: "2023-05-14T10:25:13.456Z"
  source: "handleLogin (LoginPage.tsx)"
```

Key components:

- `[42]` - Unique action ID to trace related state changes
- `set:selectedUser` - Detected action type and field
- `changes` - Object showing exactly what changed (previous and new values)
- `source` - Component/function that triggered the change

### 2. Activity-Specific Logs

```
[WARN] [2023-05-14T10:28:45.123Z] [ZustandMiddleware] [57] Activity name changed via updateActivityField
  prev: "Math Club"
  next: ""
  source: "handleNameChange (CreateActivityPage.tsx)"
  timestamp: "2023-05-14T10:28:45.123Z"
```

These specialized logs are generated whenever an activity name is modified, to help track the specific issue with disappearing activity names.

## Common Patterns to Watch For

### 1. Activity Name Loss During Creation

Look for these patterns in logs:

```
[DEBUG] [ZustandMiddleware] [120] State updated: updateActivityField
  changes: {
    currentActivity: {
      name: {
        prev: "",
        next: "Chess Club"
      }
    }
  }
  source: "handleNameInput (CreateActivityPage.tsx)"

// Later, when creating the activity:
[DEBUG] [ZustandMiddleware] [135] State updated: createActivity
  changes: {
    activities: {
      count: {
        prev: 2,
        next: 3
      },
      added: {
        id: 4289,
        name: ""  // <-- Name is empty here!
      }
    },
    currentActivity: {
      prev: {...},
      next: null
    }
  }
  source: "handleCreateActivity (CreateActivityPage.tsx)"
```

This indicates the name was set correctly in `currentActivity` but got lost when creating the actual activity.

### 2. Activity Name Loss During Navigation

```
[DEBUG] [ZustandMiddleware] [150] State updated: updateActivityField
  changes: {
    currentActivity: {
      name: {
        prev: "",
        next: "Science Lab"
      }
    }
  }
  source: "handleNameInput (CreateActivityPage.tsx)"

// Later, during navigation:
[DEBUG] [ZustandMiddleware] [158] State updated: set:currentActivity
  changes: {
    currentActivity: {
      prev: {
        name: "Science Lab",
        ...
      },
      next: {
        name: "",  // <-- Name is lost
        ...
      }
    }
  }
  source: "navigateToNextStep (CreateActivityPage.tsx)"
```

This suggests the activity name is being reset during navigation between components.

## Using the Debug Tools

### In Development Console

1. Enable verbose logging in the browser console:

   ```javascript
   localStorage.setItem('pyrePortalVerboseStoreLogging', 'true');
   window.location.reload();
   ```

2. Filter logs in the console:
   - Type "activity name" in the console filter to focus on name-related logs
   - Or filter by "[ZustandMiddleware]" to see all store-related logs

### Using the Helper Functions

The `storeLogger.ts` file includes helper functions for analyzing logs:

```typescript
// In a debugging component:
import { analyzeActivityNameChange } from '../utils/storeLogger';

// Get logs from the logger
const nameLogs = logger
  .getInMemoryLogs()
  .filter(log => log.message.includes('Activity name changed'));

// Parse the logs into the expected format
const parsedLogs = nameLogs.map(log => ({
  actionId: log.data?.actionId || 0,
  prevName: log.data?.prev || '',
  nextName: log.data?.next || '',
  source: log.data?.source || 'unknown',
  timestamp: log.timestamp,
}));

// Get analysis
const analysis = analyzeActivityNameChange(parsedLogs);
console.log(analysis);
```

## Common Issues and Solutions

### 1. Activity Name Gets Lost When Creating

**Log Pattern:**

```
// First, name is set
[DEBUG] State updated: updateActivityField
  changes: { currentActivity: { name: { prev: "", next: "Chess Club" } } }

// Later, name is empty when creating actual activity
[DEBUG] State updated: createActivity
  changes: { activities: { added: { name: "" } } }
```

**Potential Causes:**

- Deep cloning issues with the activity object
- Missing spread operation when creating the new activity
- Timing issues with asynchronous updates

**Solution:**

- Ensure proper deep cloning in the `createActivity` function
- Add explicit logging for the activity name right before creation
- Consider using immer for more reliable state updates

### 2. Activity Name Lost Between Components

**Log Pattern:**

```
// Component A sets name
[DEBUG] State updated: updateActivityField
  source: "ComponentA"

// Name disappears when accessed in Component B
[DEBUG] State updated: set:currentActivity
  source: "ComponentB"
  changes: { currentActivity: { name: { prev: "Name", next: "" } } }
```

**Potential Causes:**

- Component remounting causing store recreation
- Race conditions between state updates
- Multiple store instances

**Solution:**

- Ensure all components use the same store instance
- Add state persistence for critical fields (localStorage/sessionStorage)
- Use store middleware for state validation

## Best Practices

1. **Always check logs by source**: Identify which component is modifying the activity name

2. **Track action IDs**: Related state changes share the same action ID for easy correlation

3. **Look for timing patterns**: Many state loss issues happen during specific user flows:

   - After form submission
   - During navigation
   - When switching between tabs/views

4. **Use the timestamp data**: Sequence and timing of state changes can reveal race conditions

## Extending the Logging

To add custom tracking for other critical state fields:

1. Update the `storeMiddleware.ts` file to add specialized tracking for other fields
2. Add custom analyzers in `storeLogger.ts` for new field types
3. Update log verbosity settings as needed in `storeLogger.ts`

## Production Logging

In production, logging is automatically configured to:

1. Only track critical state changes (like activity name updates)
2. Use the INFO log level to reduce noise
3. Focus specifically on known issue patterns

## Interpreting Logs for the Activity Name Issue

When debugging the specific activity name persistence issue:

1. First, get all logs related to activity name changes:

   ```typescript
   const nameChangeLogs = logger
     .getInMemoryLogs()
     .filter(log => log.data?.changes?.currentActivity?.name);
   ```

2. Review the complete lifecycle of an activity:

   - Look for the initial name setting (from empty to a value)
   - Track what happens to the name during activity creation
   - Check if the name is correctly passed to the activities array

3. If the name is correctly set but disappears later, look for:
   - Code that resets the `currentActivity` object
   - State updates that might be overwriting the name
   - Component unmounts that might trigger state resets

## Conclusion

The enhanced state logging system provides deep visibility into PyrePortal's state management to help identify and resolve the activity name persistence issue. By carefully following state transitions through the logs, you can pinpoint exactly when and where state values are being lost or incorrectly updated.
