# Services Layer

This directory contains business logic abstraction layers for PyrePortal.

## api.ts

Purpose: all HTTP communication with the Project Phoenix backend.

Key exports:

- `api`: all API methods.
- request/response type definitions.
- `initializeApi()`: loads API base URL and device key from the active platform adapter.

Authentication pattern:

```typescript
headers: {
  'Authorization': `Bearer ${DEVICE_API_KEY}`,
  'X-Staff-PIN': pin,
  'X-Staff-ID': staffId.toString()
}
```

Key methods:

- `getTeachers()`
- `validateGlobalPIN(pin)`
- `validateTeacherPIN(pin, staffId)`
- `processRfidScan(...)`
- `getActivities(pin)`
- `getRooms(pin)`
- `startSession(...)`
- `endSession(pin)`
- `updateSessionActivity(pin)`

## sessionStorage.ts

Purpose: persist session settings across app restarts through the active platform adapter.

The implementation should call `adapter.saveSessionSettings`, `adapter.loadSessionSettings`, and `adapter.clearLastSession` instead of reaching into platform-specific APIs directly.

Data structure:

```typescript
interface SessionSettings {
  room_id: number | null;
  activity_id: number | null;
  supervisor_ids: number[];
}
```

## Removed Services

### studentCache.ts

The former offline student cache was removed. Live RFID scans are server-first and do not use local student data.

### syncQueue.ts

The former offline retry queue was removed because it was never fully wired. If offline mode returns, implement it deliberately with backend support and tests.

## Service Patterns

### Error Handling

Services throw; store/page layers catch and translate into German UI messages.

```typescript
export async function getData(): Promise<Data> {
  const response = await apiCall<ApiResponse<Data>>('/endpoint');
  if (!response.data) {
    throw new Error('No data received');
  }
  return response.data;
}
```

### Logging

Use `createLogger()` and structured data.

```typescript
logger.error('Failed to get data', { error });
```

### Platform APIs

Use `@platform` or higher-level services. Do not import native platform APIs directly from service code.

## Adding a Service Method

```typescript
export interface NewDataType {
  id: number;
  name: string;
}

interface NewDataResponse {
  status: string;
  data: NewDataType[];
}

export const api = {
  async getNewData(pin: string, staffId?: number): Promise<NewDataType[]> {
    const response = await apiCall<NewDataResponse>('/api/new-endpoint', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
        ...(staffId != null && { 'X-Staff-ID': staffId.toString() }),
      },
    });
    return response.data;
  },
};
```

## Network Quality Tracking

API calls report network quality through the callback registered by the app. This feeds the global network indicator.

## Timeout Prevention

Session timeout prevention runs through keepalive calls such as:

```typescript
await api.updateSessionActivity(pin);
```
