# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyrePortal is a **Raspberry Pi kiosk application** for German after-school care (OGS) that uses RFID scanning for student check-in/check-out. Built with Tauri v2, React 18, and TypeScript 5.6 in strict mode.

**Target deployment**: Raspberry Pi 5 (64-bit), fullscreen kiosk mode, physical RFID reader hardware.

## Development Commands

### Essential Commands

```bash
# Development
npm run tauri dev       # Full app (Rust + Frontend) - required for RFID testing
npm run dev            # Frontend only (faster, use when working on UI only)

# Code quality (ALWAYS run before committing)
npm run check          # ESLint + TypeScript - must pass
npm run format         # Auto-format with Prettier

# Production build
npm run tauri build    # Platform-specific installers in src-tauri/target/release/bundle/

# Rust development (in src-tauri/)
cargo clippy           # Linter (strict)
cargo fmt             # Format
cargo test            # Run tests
```

### Running Individual Tests

```bash
# Frontend tests (when implemented - currently no tests)
npm test -- <test-file-pattern>

# Rust tests
cd src-tauri && cargo test <test-name>
cd src-tauri && ./test_rfid.sh  # Test RFID hardware (compiles and runs test binary)
```

## Critical Architecture Patterns

### 1. Server-First RFID Scanning (Correctness-Critical)

**Location**: `src/hooks/useRfidScanning.ts:118-215`

**Why**: RFID actions must be authoritative; backend is the source of truth (no local student cache).

**Flow**:

```typescript
// 1. Call server FIRST (authoritative)
const serverResult = await api.processRfidScan(...);
setScanResult(serverResult);
showScanModal();
```

**When modifying**:

- Test rapid scans (<1s apart)
- Verify offline → online transition

### 2. Multi-Layer Duplicate Prevention

**Location**: `src/store/userStore.ts:1117-1201`

**Why**: RFID hardware emits multiple events per scan (hardware quirk). Three defensive layers:

1. **Processing Queue**: Block if tag currently being processed
2. **Recent Scans**: Block if scanned within 2 seconds
3. **Student History**: Block opposite action if just performed

**Implementation**:

```typescript
canProcessTag(tagId) → checks all 3 layers
recordTagScan(tagId) → updates layer 2
mapTagToStudent(tagId, studentId) → enables layer 3
```

### 3. Zustand Store with Logging Middleware

**Location**: `src/store/userStore.ts:1540-1551`

**Pattern**: Single store (not Redux) with custom middleware for complete action/state visibility. See `src/store/CLAUDE.md` for middleware configuration and logging details.

### 4. Runtime Configuration via Tauri

**Location**: `src-tauri/src/lib.rs:17-32`, `src/services/api.ts:25-54`

**Why**: API keys must be changeable without rebuilding (different keys per Pi device).

**Flow**:

```
.env file (runtime)
  ↓
Rust reads env vars
  ↓
Frontend calls get_api_config()
  ↓
API client configured with device-specific credentials
```

**Never** put API keys in VITE\_\* variables (baked into build).

### 5. Three-Layer Logging System

**Layers** (in order of data flow):

1. **Frontend Logger** (`src/utils/logger.ts`)
   - Browser console + in-memory buffer
   - Sends entries to Rust via IPC

2. **Store Logger** (`src/utils/storeMiddleware.ts`)
   - Automatic Zustand action tracking
   - Middleware wraps store creation

3. **Rust File Logger** (`src-tauri/src/logging.rs`)
   - Persists to disk with rotation
   - Locations:
     - macOS: `~/Library/Logs/pyreportal/`
     - Linux: `~/.config/pyreportal/logs/`

**Usage**:

```typescript
const logger = createLogger('ComponentName');
logger.info('Message', { contextData });
```

## API Integration (Project Phoenix Backend)

### Environment Setup

```bash
# .env (NEVER commit this file)
API_BASE_URL=http://localhost:8080           # Runtime (Rust reads)
DEVICE_API_KEY=device_secret_key_here        # Runtime (Rust reads)
TAURI_FULLSCREEN=false                       # Runtime (Rust reads)

# Development-only (baked into frontend at build time)
VITE_ENABLE_RFID=false                       # true = real hardware
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,... # Mock tags for testing
```

### Authentication Pattern

**Two-level auth** (all requests):

```typescript
headers: {
  'Authorization': `Bearer ${DEVICE_API_KEY}`,  // Device level
  'X-Staff-PIN': pin,                           // Staff level
  'X-Staff-ID': staffId.toString()              // Optional
}
```

### Key Endpoints

| Endpoint                         | Purpose                | Auth                    |
| -------------------------------- | ---------------------- | ----------------------- |
| `GET /api/iot/teachers`          | Fetch staff list       | Device only             |
| `POST /api/iot/ping`             | Validate global PIN    | Device + PIN            |
| `GET /api/iot/status`            | Validate teacher PIN   | Device + PIN + Staff ID |
| `POST /api/iot/checkin`          | Process RFID scan      | Device + PIN            |
| `POST /api/iot/session/start`    | Start activity session | Device + PIN            |
| `POST /api/iot/session/activity` | Prevent timeout        | Device + PIN            |

**Error codes**:

- 401: Invalid PIN
- 423: Account locked (too many attempts)
- 404: Not found

## Adding New Features

### Adding API Endpoint

1. **Define types** in `src/services/api.ts`:

   ```typescript
   export interface NewDataType {
     id: number;
     name: string;
   }
   ```

2. **Add API method** in `src/services/api.ts`:

   ```typescript
   async getNewData(pin: string): Promise<NewDataType[]> {
     const response = await apiCall<{status: string; data: NewDataType[]}>(
       '/api/endpoint',
       { headers: { Authorization: `Bearer ${DEVICE_API_KEY}`, 'X-Staff-PIN': pin } }
     );
     return response.data;
   }
   ```

3. **Add store action** in `src/store/userStore.ts`:

   ```typescript
   interface UserState {
     newData: NewDataType[];
     fetchNewData: () => Promise<void>;
   }

   const createUserStore = (set, get) => ({
     newData: [],

     fetchNewData: async () => {
       set({ isLoading: true, error: null });
       try {
         const data = await api.getNewData(get().authenticatedUser.pin);
         set({ newData: data, isLoading: false });
       } catch (error) {
         logger.error('Failed to fetch data', { error });
         set({ error: 'User-friendly German message', isLoading: false });
       }
     },
   });
   ```

### Adding Tauri Command

See `src-tauri/CLAUDE.md` for Rust command patterns and `src/services/CLAUDE.md` for frontend `safeInvoke` usage.

## Working with RFID

**Development** (no hardware):

```bash
VITE_ENABLE_RFID=false  # in .env
```

- Uses mock scanning (auto-generates scans every 3-5s)
- Mock tags from `VITE_MOCK_RFID_TAGS`

**Production** (Raspberry Pi):

```bash
VITE_ENABLE_RFID=true  # in .env
```

- Requires MFRC522 reader on SPI
- Only compiles on ARM/ARM64 Linux with `--features rfid`
- Test with: `cd src-tauri && ./test_rfid.sh` (compiles and runs automatically)

**Hook usage**:

```typescript
const { isScanning, startScanning, stopScanning, currentScan, showModal } = useRfidScanning();
```

## TypeScript Configuration (Strict Mode)

**tsconfig.json** enforces:

- `strict: true` (all strict checks)
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- No implicit `any` types
- Null/undefined must be explicitly handled

**ESLint** enforces:

- Consistent type imports: `import { api, type Teacher } from ...`
- Import order: external → internal → parent → sibling
- React hooks rules (exhaustive deps)
- Security rules (no hardcoded paths, no `__dirname`)

## Performance Optimization (Raspberry Pi)

**Critical patterns**:

- Use `React.memo` for expensive components
- Batch Zustand `set()` calls (see `src/store/CLAUDE.md` for examples)
- Minimize Tauri IPC calls (batch when possible)
- Use CSS transforms for animations (GPU-accelerated)

**Expected performance**:

- 64-bit Pi build: 30-45 FPS ✅
- 32-bit Pi build: 15-25 FPS ❌

## Troubleshooting

### RFID Issues

1. Check `.env`: `VITE_ENABLE_RFID=false` (dev) or `true` (Pi)
2. Verify mock tags: `VITE_MOCK_RFID_TAGS=04:D6:...`
3. Console: Look for "RFID service initialized"
4. Pi hardware: `cd src-tauri && ./test_rfid.sh`

### API Issues

1. Check `.env`: `API_BASE_URL` and `DEVICE_API_KEY` set
2. Console: Network tab for failed requests
3. Backend running: `curl http://localhost:8080/health`

### Build Issues

```bash
npm run clean:target   # Clean Rust artifacts
rm -rf node_modules dist
npm install
npm run tauri build
```

## Current Implementation Status

### ✅ Completed

- Teacher authentication (PIN validation)
- RFID scanning (server-first, multi-layer duplicate prevention)
- Session management (start/end with timeout prevention)
- Offline sync queue
- Three-layer logging system

### 🔧 In Progress

- Attendance analytics
- Session timeout UI warnings

### 📋 Planned

- Biometric authentication
- Advanced reporting dashboard

## Platform-Specific: Raspberry Pi 5

**Recommended**: Native 64-bit build

**Performance gain**: 50-80% vs cross-compiled 32-bit

- Build time: 7-15 min on Pi 5
- Target: `aarch64-unknown-linux-gnu`

**Deployment**:

```bash
# On Pi
DISPLAY=:0 TAURI_FULLSCREEN=true ./pyreportal
```

**Auto-start**: Create systemd service or desktop autostart entry
