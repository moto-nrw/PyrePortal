# Zustand Store - State Management

## Single Store Pattern

PyrePortal uses **one centralized Zustand store** (`userStore.ts`) for all application state.

**Why single store:**

- Simpler than Redux (no actions/reducers/dispatchers)
- Better TypeScript integration
- Automatic logging via middleware
- No prop drilling

## Store Structure

### State Categories

1. **Authentication**
   - `authenticatedUser` - Current logged-in staff member (includes PIN for API calls)
   - `users` - Available teachers
   - `isLoading`, `error` - Request state

2. **Session**
   - `currentSession` - Active session from the backend
   - `selectedActivity`, `selectedRoom` (`_roomSelectedAt` guards against stale server data overwriting a fresh manual room switch)
   - `selectedSupervisors`, `activeSupervisorTags`
   - `sessionSettings`, `isValidatingLastSession` - "Use last session" persistence

3. **RFID** (`rfid.*`)
   - `isScanning`, `currentScan`, `showModal`
   - `scanMode`, `scanContextId`, `pickupQueryTagId` - Pickup query flow
   - `processingQueue` - Tags currently being processed
   - `recentTagScans` - Short-lived result cache (see `RECENT_SCAN_CACHE_TTL_MS`), NOT a dedup gate

4. **Network**
   - `networkStatus` - Online/offline quality and response time

### Action Categories

1. **Authentication**: `setAuthenticatedUser`, `fetchTeachers`, `logout`
2. **Session**: `fetchRooms`, `selectRoom`, `fetchCurrentSession`, `setSelectedActivity`, `fetchActivities`, `clearSessionState`
3. **Supervisors**: `setSelectedSupervisors`, `toggleSupervisor`, `addSupervisorFromRfid`, `addActiveSupervisorTag`, `isActiveSupervisor`
4. **RFID**: `startRfidScanning`, `stopRfidScanning`, `setScanResult`, `showScanModal`, `hideScanModal`, pickup-query mode actions, and the duplicate-prevention actions below
5. **Session settings**: `loadSessionSettings`, `toggleUseLastSession`, `saveLastSessionData`, `validateAndRecreateSession`
6. **Feedback**: `submitDailyFeedback`

## Logging Middleware

Store is wrapped with custom logging middleware:

```typescript
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, {
    name: 'UserStore',
    logLevel: LogLevel.DEBUG,
    stateChanges: true,
    actionSource: true,
    excludedActions: ['functionalUpdate'],
  })
);
```

**Logged Events:**

- Action calls with a diff of changed state (before/after)
- Action source (which component triggered the change)

When nothing would be logged at the configured level (typical production), the middleware takes a fast path and skips diff/stack-trace work entirely.

## Critical Store Patterns

### 1. Batch State Updates

**Always batch to prevent cascading renders:**

```typescript
// ✅ GOOD: Single render
set({ isLoading: true, error: null, data: result });

// ❌ BAD: 3 renders
set({ isLoading: true });
set({ error: null });
set({ data: result });
```

### 2. Error Handling Pattern

```typescript
actionName: async () => {
  set({ isLoading: true, error: null });
  try {
    const result = await api.doSomething();
    set({ result, isLoading: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    storeLogger.error('Action failed', { error: message });
    set({ error: mapServerErrorToGerman(message), isLoading: false });
  }
};
```

Always clear `isLoading` in both the success AND error paths. User-facing error strings are German; log messages are English.

### 3. Multi-Layer Duplicate Prevention (RFID)

RFID hardware and browser mocks can deliver duplicate scan events. Defense in depth:

**Layer 1: Processing queue** — `canProcessTag` rejects tags already in `rfid.processingQueue`.

**Layer 2: scanId dedup** — handled in `useRfidScanning`'s `onAdapterScan` before the store is consulted: each adapter scan event carries a `scanId`, and already-processed ids are skipped. `recentTagScans` is NOT part of this — it is only a short-lived cache for result replay and background-sync promises.

### 4. Deduplication Pattern (API Calls)

`fetchActivities` prevents concurrent duplicate fetches by caching the in-flight promise in a closure:

```typescript
fetchActivities: (() => {
  let fetchPromise: Promise<ActivityResponse[] | null> | null = null;

  return async (): Promise<ActivityResponse[] | null> => {
    if (fetchPromise) {
      return fetchPromise;
    }

    fetchPromise = (async () => {
      try {
        return await api.getActivities(pin);
      } finally {
        fetchPromise = null;
      }
    })();

    return fetchPromise;
  };
})();
```

Note: `fetchActivities` returns the data to the caller; it does not cache activities in store state.

## Using Store in Components

### Select Specific State (Optimized)

```typescript
function MyComponent() {
  // ✅ GOOD: Only re-renders when users or isLoading change
  const { users, isLoading } = useUserStore(state => ({
    users: state.users,
    isLoading: state.isLoading,
  }));
}
```

### Call Actions

```typescript
function MyComponent() {
  const { fetchTeachers } = useUserStore();

  useEffect(() => {
    void fetchTeachers(); // Call async action
  }, [fetchTeachers]);
}
```

### Direct State Updates (Rare)

```typescript
// For simple UI state only
useUserStore.setState({ ... });
```

## Adding Store Actions

### Template for Async Action

```typescript
actionName: async (param: ParamType): Promise<void> => {
  const { authenticatedUser } = get();

  if (!authenticatedUser?.pin) {
    set({ error: 'Nicht authentifiziert' });
    return;
  }

  set({ isLoading: true, error: null });

  try {
    storeLogger.info('Starting action', { param });
    const result = await api.doSomething(authenticatedUser.pin, param);
    set({ result, isLoading: false });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    storeLogger.error('Action failed', { error: errorMessage });
    set({ error: mapServerErrorToGerman(errorMessage), isLoading: false });
  }
};
```

## Common Pitfalls

### ❌ Creating Objects in Set

```typescript
// BAD: Creates new object every time
set({ user: { ...get().user, name: 'New' } });

// GOOD: Only when actually changing
if (get().user.name !== newName) {
  set({ user: { ...get().user, name: newName } });
}
```

### ❌ Forgetting to Clear Loading State

```typescript
// BAD: Loading state stuck on error
try {
  const result = await api.doSomething();
  set({ result, isLoading: false });
} catch (error) {
  set({ error: 'Fehler' });
  // isLoading still true!
}
```
