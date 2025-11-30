# Services Layer - Business Logic

This directory contains all business logic abstraction layers for PyrePortal.

## Service Files

### api.ts (947 lines)

**Purpose**: All HTTP communication with Project Phoenix backend

**Key Exports**:

- `api` object - All API methods
- Type definitions for all API requests/responses
- `initializeApi()` - Load config from Rust backend

**Authentication Pattern**:

```typescript
// Two-level auth on every request
headers: {
  'Authorization': `Bearer ${DEVICE_API_KEY}`,  // Device level
  'X-Staff-PIN': pin,                           // Staff level
  'X-Staff-ID': staffId.toString()              // Optional
}
```

**Key Methods**:

- `getTeachers()` - Fetch teacher list
- `validateGlobalPIN(pin)` - Validate OGS global PIN
- `validateTeacherPIN(pin, staffId)` - Validate individual teacher PIN
- `processRfidScan(...)` - Process RFID check-in/out
- `getActivities(pin)` - Get teacher's activities
- `getRooms(pin)` - Get available rooms
- `startSession(...)` - Start activity session
- `endSession(pin)` - End current session
- `updateSessionActivity(pin)` - Prevent session timeout

### sessionStorage.ts

**Purpose**: Persist session settings across app restarts via Tauri IPC

**Pattern**:

```typescript
import { safeInvoke } from '../utils/tauriContext';

// Save session
export async function saveSessionSettings(settings: SessionSettings) {
  await safeInvoke('save_session_settings', { settings });
}

// Load session
export async function loadSessionSettings(): Promise<SessionSettings | null> {
  return await safeInvoke<SessionSettings>('load_session_settings');
}
```

**Data Structure**:

```typescript
interface SessionSettings {
  room_id: number | null;
  activity_id: number | null;
  supervisor_ids: number[];
}
```

### studentCache.ts (entfernt)

Die frühere Offline-Studenten-Cache-Implementierung wurde entfernt. Live-RFID-Scans arbeiten ausschließlich server-first; es gibt keinen lokalen Cache oder Persistenzpfad mehr. Sollte künftig wieder ein Offline-Feature benötigt werden, müsste der Cache neu eingeführt oder serverseitig unterstützt werden.

### syncQueue.ts

**Purpose**: Queue failed operations for retry when network returns

**Key Exports**:

- `queueFailedScan(tagId, action, roomId, pin)` - Queue failed RFID scan
- `processQueue()` - Process all queued operations
- `getSyncQueueStatus()` - Get queue stats

**Retry Strategy**:

- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Max retries: 5
- Auto-retry on network quality improvement

**Usage in Hook**:

```typescript
try {
  const result = await api.processRfidScan(...);
} catch (error) {
  // Queue for retry
  const operationId = queueFailedScan(tagId, 'checkin', roomId, pin);
  logger.info('Scan queued', { operationId });
}
```

## Service Layer Patterns

### Error Handling

All services throw errors, store layer catches:

```typescript
// Service (throw)
export async function getData(): Promise<Data> {
  const response = await apiCall<ApiResponse<Data>>('/endpoint');
  if (!response.data) {
    throw new Error('No data received');
  }
  return response.data;
}

// Store (catch)
try {
  const data = await getData();
  set({ data });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  logger.error('Failed to get data', { error: message });
  set({ error: 'Fehler beim Laden' });
}
```

### Logging

All services use logger:

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('ServiceName');

logger.info('Operation started', { context });
logger.error('Operation failed', { error });
```

### Tauri IPC Wrapper

Always use `safeInvoke` from `tauriContext`:

```typescript
import { safeInvoke } from '../utils/tauriContext';

// ✅ GOOD: Safe invoke with error handling
const result = await safeInvoke<ReturnType>('command_name', { args });

// ❌ BAD: Direct invoke (breaks in web context)
const result = await invoke('command_name', { args });
```

## Adding New Service Method

### API Method Template

```typescript
// 1. Add type definitions
export interface NewDataType {
  id: number;
  name: string;
}

interface NewDataResponse {
  status: string;
  data: NewDataType[];
}

// 2. Add method to api object
export const api = {
  // ... existing methods

  async getNewData(pin: string): Promise<NewDataType[]> {
    const response = await apiCall<NewDataResponse>('/api/new-endpoint', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
    return response.data;
  },
};
```

### Tauri IPC Service Template

```typescript
// 1. Define Rust command in src-tauri/src/lib.rs
#[tauri::command]
fn do_something(param: String) -> Result<ReturnType, String> {
  // Implementation
}

// 2. Add to frontend service
export async function doSomething(param: string): Promise<ReturnType> {
  return await safeInvoke<ReturnType>('do_something', { param });
}
```

## Network Quality Tracking

API service tracks call success/failure for quality monitoring:

```typescript
// In api.ts
let successfulCalls = 0;
let failedCalls = 0;

export function getNetworkQuality(): 'good' | 'poor' | 'offline' {
  const total = successfulCalls + failedCalls;
  if (total === 0) return 'good';

  const successRate = successfulCalls / total;
  return successRate > 0.8 ? 'good' : 'poor';
}
```

Used by `useNetworkStatus` hook for UI indicator.

## Performance Considerations

### Caching

- Always check cache before API call (instant UI)
- Background sync to keep cache fresh
- Daily cache invalidation (prevent stale data)

### Deduplication

API service prevents duplicate concurrent fetches:

```typescript
let fetchPromise: Promise<Data> | null = null;

export async function getData(): Promise<Data> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      return await apiCall('/endpoint');
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}
```

### Timeout Prevention

Session timeout prevention via keepalive:

```typescript
// Send on every RFID scan
await api.updateSessionActivity(pin);
```
