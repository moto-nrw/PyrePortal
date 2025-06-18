# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyrePortal is a desktop application built with Tauri v2, React, and TypeScript. It serves as a client for the Project Phoenix system, providing an interface for managing room occupancy and activities in educational settings using RFID scanning for student check-in/check-out.

### Key Features

- **Teacher Authentication**: PIN-based login with real API integration
- **Room Management**: View and select rooms with occupancy status
- **RFID Scanning**: Hardware integration for student check-in/check-out (mock available for dev)
- **Activity Tracking**: Create and manage educational activities
- **Comprehensive Logging**: Multi-layer logging system (frontend, store, Rust backend)
- **Cross-Platform**: Windows, macOS, and Linux support

## Architecture

### Frontend (React + TypeScript)
- State management: Zustand with middleware for logging
- Routing: React Router v7 with typed routes
- Styling: Tailwind CSS v4 with custom theme system
- API layer: Centralized service with error handling

### Backend (Rust + Tauri)
- IPC commands for logging and RFID operations
- Platform-specific RFID hardware integration
- File system operations with security checks

### Key Architectural Patterns
- **Mock/Real API switching**: Environment-based configuration
- **RFID abstraction**: Hardware implementation with mock fallback
- **Logging layers**: Frontend → Tauri IPC → File system
- **Error boundaries**: Consistent error handling across IPC

## Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Development modes
npm run tauri dev       # Full app with Tauri backend
npm run dev            # Frontend only (faster UI development)

# Code quality (run before committing)
npm run check          # ESLint + TypeScript checks
npm run typecheck      # TypeScript only
npm run lint          # ESLint only
npm run lint:fix      # Auto-fix lint issues

# Production build
npm run tauri build    # Creates platform-specific installers

# Maintenance
npm run format        # Prettier formatting
npm run clean:target  # Clean Rust build artifacts
```

### Rust Commands (run in src-tauri/)

```bash
cargo check          # Fast syntax/type checking
cargo clippy         # Rust linter
cargo fmt           # Format Rust code
cargo test          # Run Rust tests
```

### Running Tests

```bash
# Frontend tests (when implemented)
npm test            # Run all tests
npm test -- --watch # Watch mode

# Rust tests
cd src-tauri && cargo test
```

## API Integration

### Environment Configuration

```bash
# .env file setup (copy from .env.example)
VITE_API_BASE_URL=http://localhost:8080
VITE_DEVICE_API_KEY=your_device_api_key
VITE_ENABLE_RFID=false  # true for real hardware
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,04:A7:B3:C2:D1:E0:F5
TAURI_FULLSCREEN=false
```

### API Endpoints (Project Phoenix)

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /api/iot/staff` | ✅ Implemented | Fetch teacher list |
| `POST /api/iot/status` | 🔧 In Progress | PIN validation |
| `GET /api/iot/rooms` | 📋 Planned | Room list/status |
| `POST /api/iot/rfid/scan` | ✅ Implemented | RFID check-in/out |
| `POST /api/iot/session/start` | ✅ Implemented | Start activity session |
| `POST /api/iot/session/activity` | ✅ Implemented | Update session activity |

## Key Implementation Patterns

### State Management (Zustand)

```typescript
// Store with logging middleware
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, {
    name: 'UserStore',
    logLevel: LogLevel.DEBUG,
  })
);
```

### API Error Handling

```typescript
// Consistent error structure
try {
  const result = await api.someMethod();
} catch (error) {
  // Error includes status code and detail message
  logger.error('API call failed', { error });
}
```

### RFID Integration

```typescript
// Check hardware availability
if (isRfidEnabled()) {
  // Real hardware
  await safeInvoke('start_rfid_scanning');
} else {
  // Mock scanning for development
  startMockScanning();
}
```

### Modal Patterns

```typescript
// Reusable modal with auto-close
<ErrorModal
  isOpen={showError}
  onClose={() => setShowError(false)}
  message={errorMsg}
  autoCloseDelay={3000}
/>
```

## Common Development Tasks

### Adding a New Page/Route

1. Create component in `/src/pages/`
2. Add route in `/src/App.tsx`
3. Update navigation logic
4. Add logging for navigation events

### Adding API Endpoints

1. Define types in `/src/services/api.ts`
2. Implement API call with error handling
3. Update store actions in `/src/store/`
4. Add appropriate logging

### Adding Tauri Commands

1. Define command in `/src-tauri/src/` with `#[tauri::command]`
2. Register in `lib.rs` command handler
3. Create TypeScript wrapper in frontend
4. Handle errors across IPC boundary

### Working with RFID

1. Check `VITE_ENABLE_RFID` environment variable
2. Use `useRfidScanning` hook for scanning logic
3. Mock tags configured in `.env` for development
4. Real hardware requires Raspberry Pi with RFID reader

## Troubleshooting

### Build Issues

```bash
# Clean everything and rebuild
npm run clean:target
rm -rf node_modules
npm install
npm run tauri build
```

### RFID Not Working

1. Check `.env` configuration
2. Verify mock tags match backend configuration
3. Check console for RFID service initialization
4. On Raspberry Pi: verify hardware connections

### API Connection Issues

1. Verify `VITE_API_BASE_URL` in `.env`
2. Check `VITE_DEVICE_API_KEY` is set
3. Look for CORS errors in console
4. Check backend server is running

## Performance Optimization

- **Minimize Tauri IPC calls**: Batch operations when possible
- **Use React.memo**: For expensive components
- **Optimize re-renders**: Check Zustand subscriptions
- **Log performance**: Use performance marks for critical paths

## Logging System

### Components

1. **Frontend Logger** (`src/utils/logger.ts`): Context-aware with multiple levels
2. **Store Logger** (`src/utils/storeLogger.ts`): Zustand middleware for action tracking
3. **Rust Logger** (`src-tauri/src/logging.rs`): File persistence with rotation

### Best Practices

- Use appropriate log levels (DEBUG, INFO, WARN, ERROR)
- Include context (user, room, activity IDs)
- Never log sensitive data (PINs, tokens)
- Follow patterns in `docs/logging-guidelines.md`

### Log Locations

- **Development**: Browser console + in-memory viewer
- **Production**: 
  - Windows: `%APPDATA%\pyreportal\logs`
  - macOS: `~/Library/Logs/pyreportal`
  - Linux: `~/.config/pyreportal/logs`

## Tauri IPC Interface

### Command Pattern

```rust
// Rust side (src-tauri/src/logging.rs)
#[tauri::command]
async fn write_log(entry: LogEntry) -> Result<(), String> {
    // Implementation
}

// Register in lib.rs
.invoke_handler(tauri::generate_handler![write_log])
```

```typescript
// Frontend side
await invoke('write_log', { entry: logData });
```

### Current Commands

- `write_log`: Persist log entries to file system
- `quit_app`: Graceful application shutdown
- RFID commands: `initialize_rfid_service`, `start_rfid_scanning`, etc.

## Security Considerations

- **API Keys**: Store in environment variables, never commit
- **PIN Validation**: Server-side only, never trust client
- **File Paths**: Validate all paths in Rust before file operations
- **RFID Tags**: Validate format before processing
- **IPC Boundaries**: Sanitize all data crossing JS/Rust boundary

## Current Implementation Status

### ✅ Completed
- Teacher list API integration
- Basic PIN authentication flow
- RFID mock scanning
- Activity session creation
- Comprehensive logging system
- Error modal component

### 🔧 In Progress
- Real PIN validation via API
- Session timeout management
- Activity analytics

### 📋 Planned
- Offline mode with sync
- Biometric authentication
- Advanced reporting
- Raspberry Pi deployment scripts