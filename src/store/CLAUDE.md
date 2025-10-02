# Zustand Store - State Management

## Single Store Pattern

PyrePortal uses **one centralized Zustand store** (`userStore.ts` - 1552 lines) for all application state.

**Why single store:**
- Simpler than Redux (no actions/reducers/dispatchers)
- Better TypeScript integration
- Automatic logging via middleware
- No prop drilling

## Store Structure

### State Categories
1. **Authentication State** (lines 82-185)
   - `authenticatedUser` - Current logged-in staff member
   - `users` - Available teachers
   - `isLoading` - Loading indicator
   - `error` - Error message

2. **Session State** (lines 186-395)
   - `currentSession` - Active session details
   - `activities` - Teacher's activities
   - `rooms` - Available rooms

3. **RFID State** (lines 1117-1201)
   - `rfid.processingQueue` - Tags currently being processed
   - `rfid.recentTagScans` - Recent scans (duplicate prevention)
   - `rfid.tagToStudentMap` - Tag → Student mapping

4. **UI State**
   - `showModal` - Modal visibility
   - `scanResult` - Last RFID scan result

### Action Categories
1. **Teacher Management** (lines 354-450)
   - `fetchTeachers()` - Load teacher list
   - `selectUser(userId)` - Select teacher
   - `setPin(pin)` - Set PIN

2. **Authentication** (lines 489-629)
   - `validateGlobalPIN(pin)` - Validate OGS PIN
   - `validateTeacherPIN(pin, staffId)` - Validate teacher PIN
   - `logout()` - Clear auth state

3. **Session Management** (lines 721-1116)
   - `fetchActivities()` - Load activities
   - `fetchRooms()` - Load available rooms
   - `startSession(...)` - Start activity session
   - `endSession()` - End current session

4. **RFID Processing** (lines 1117-1300)
   - `canProcessTag(tagId)` - Check if tag can be processed (duplicate prevention)
   - `recordTagScan(tagId)` - Record scan timestamp
   - `mapTagToStudent(tagId, studentId)` - Map tag to student
   - `isValidStudentScan(studentId, action)` - Validate student action

## Logging Middleware

Store is wrapped with custom logging middleware:
```typescript
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, {
    name: 'UserStore',
    logLevel: LogLevel.DEBUG,
    excludedActions: ['functionalUpdate'],
  })
);
```

**Logged Events:**
- Action calls with arguments
- State changes (before/after)
- Action source (which component)

**Example Log Output:**
```
[UserStore] Action: fetchTeachers
[UserStore] State changed: users (0 → 15 items)
[UserStore] Action: setPin { pin: '****' }
```

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
    logger.error('Action failed', { error: message });
    set({ error: 'Benutzerfreundliche deutsche Nachricht', isLoading: false });
  }
}
```

### 3. Multi-Layer Duplicate Prevention (RFID)

**Three defensive layers** (lines 1117-1201):

**Layer 1: Processing Queue**
```typescript
canProcessTag: (tagId: string) => {
  if (get().rfid.processingQueue.has(tagId)) {
    logger.debug('Tag already processing');
    return false;
  }
  // ... continue checks
}
```

**Layer 2: Recent Scans (2-second window)**
```typescript
const recentScan = get().rfid.recentTagScans.get(tagId);
if (recentScan && Date.now() - recentScan.timestamp < 2000) {
  logger.debug('Tag scanned too recently');
  return false;
}
```

**Layer 3: Student History (prevent opposite action)**
```typescript
isValidStudentScan: (studentId: number, requestedAction: 'checkin' | 'checkout') => {
  const recentStudentAction = get().rfid.recentStudentActions.get(studentId);
  if (!recentStudentAction) return true;

  // If checked in, only allow checkout
  if (recentStudentAction.action === 'checkin' && requestedAction === 'checkin') {
    return false;
  }

  // If checked out, only allow checkin
  if (recentStudentAction.action === 'checkout' && requestedAction === 'checkout') {
    return false;
  }

  return true;
}
```

### 4. Deduplication Pattern (API Calls)

**Prevents concurrent duplicate fetches:**
```typescript
fetchActivities: (() => {
  let fetchPromise: Promise<ActivityResponse[] | null> | null = null;

  return async (): Promise<ActivityResponse[] | null> => {
    if (fetchPromise) {
      logger.debug('Fetch already in progress');
      return fetchPromise;
    }

    fetchPromise = (async () => {
      try {
        const data = await api.getActivities(pin);
        return data;
      } finally {
        fetchPromise = null;
      }
    })();

    return fetchPromise;
  };
})()
```

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

### Select All State (Less Optimal)
```typescript
function MyComponent() {
  // ⚠️ OK but not optimal: Re-renders on any store change
  const { users, isLoading } = useUserStore();
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
useUserStore.setState({ showModal: false });
```

## Adding Store Actions

### Template for Async Action
```typescript
actionName: async (param: ParamType): Promise<void> => {
  const { authenticatedUser } = get();

  // Validation
  if (!authenticatedUser?.pin) {
    set({ error: 'Nicht authentifiziert' });
    return;
  }

  // Loading state
  set({ isLoading: true, error: null });

  try {
    storeLogger.info('Starting action', { param });

    // API call
    const result = await api.doSomething(authenticatedUser.pin, param);

    // Update state
    set({
      result,
      isLoading: false,
    });

    storeLogger.info('Action completed', { result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    storeLogger.error('Action failed', { error: errorMessage });

    set({
      error: 'Fehler beim Laden',
      isLoading: false,
    });
  }
}
```

### Template for Sync Action
```typescript
actionName: (param: ParamType) => {
  storeLogger.info('Setting value', { param });
  set({ value: param });
}
```

## Performance Tips

### Avoid Re-renders
1. Use selector functions for specific state
2. Memoize expensive computations outside store
3. Don't create new objects/arrays in selectors

### Logging Performance
- Exclude high-frequency actions from logging: `excludedActions: ['functionalUpdate']`
- Use `LogLevel.WARN` in production to reduce overhead

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

### ❌ Not Handling Errors
```typescript
// BAD: Error crashes component
actionName: async () => {
  const result = await api.doSomething();
  set({ result });
}

// GOOD: Error handled gracefully
actionName: async () => {
  try {
    const result = await api.doSomething();
    set({ result });
  } catch (error) {
    set({ error: 'Fehler' });
  }
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

// GOOD: Always clear loading
try {
  const result = await api.doSomething();
  set({ result, isLoading: false });
} catch (error) {
  set({ error: 'Fehler', isLoading: false });
}
```
