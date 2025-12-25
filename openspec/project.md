# Project Context

## Purpose

PyrePortal is a **Raspberry Pi kiosk application** for German after-school care (OGS - Offene Ganztagsschule) that uses RFID scanning for student check-in/check-out. Built with Tauri v2, React, and TypeScript in strict mode.

**Primary use case**: Staff authenticate via PIN, then students tap RFID cards to record arrivals/departures. The system runs fullscreen on Raspberry Pi 5 devices mounted at facility entrances.

**Target deployment**: Raspberry Pi 5 (64-bit ARM), fullscreen kiosk mode, physical MFRC522 RFID reader hardware.

## Tech Stack

### Frontend

- **UI Framework:** React 19.x with TypeScript 5.9 (strict mode)
- **Build Tool:** Vite 7.x
- **State Management:** Zustand 5.x (single store with logging middleware)
- **Routing:** React Router 7.x
- **Styling:** TailwindCSS 4.x (utility-first)
- **Icons:** FontAwesome 7.x

### Backend (Tauri)

- **Framework:** Tauri v2
- **Language:** Rust 2021 edition
- **Async Runtime:** Tokio (multi-threaded)
- **Serialization:** Serde + serde_json
- **Date/Time:** Chrono
- **Environment:** dotenvy

### Hardware Integration (ARM Linux only)

- **RFID Reader:** mfrc522 0.8.x (MFRC522 module via SPI)
- **GPIO/SPI:** rppal 0.22.x
- **HAL:** embedded-hal 0.2.x, linux-embedded-hal 0.3.x

## Project Conventions

### Code Style

- **Formatting (Prettier):**
  - 100 char line width, 2-space indent (no tabs)
  - Single quotes for JS/TS, double quotes for CSS/JSON/HTML
  - Semicolons required, trailing commas (ES5 style)
  - Arrow functions: omit parens for single param (`x => x`)
  - LF line endings
  - Tailwind class sorting via `prettier-plugin-tailwindcss`

- **Linting (ESLint):**
  - TypeScript: recommended + type-checked + stylistic rules
  - React Hooks: rules-of-hooks (error), exhaustive-deps (warn)
  - Imports: sorted alphabetically by group (builtin → external → internal → parent → sibling → index)
  - Consistent type imports: `import { type Foo } from ...`
  - Accessibility: jsx-a11y plugin (warnings)
  - Security: detect unsafe patterns, no hardcoded paths

- **Rust:**
  - `cargo fmt` for formatting
  - `cargo clippy` for linting (strict)
  - All Tauri commands return `Result<T, String>`

### Architecture Patterns

#### Critical: Server-First RFID Scanning

The backend API is the **authoritative source** for RFID scan processing. No local student cache exists.

```
RFID tap → Call server API first → Display result from server
```

This ensures consistency across devices and prevents stale data issues.

#### Critical: Multi-Layer Duplicate Prevention

RFID hardware emits multiple events per physical tap. Three defensive layers prevent duplicate processing:

1. **Processing Queue:** Block if tag currently being processed
2. **Recent Scans:** Block if same tag scanned within 2 seconds
3. **Student History:** Block opposite action if just performed

#### State Management

Single Zustand store (`src/store/userStore.ts`) with custom logging middleware for complete action visibility. State updates are batched where possible for Pi performance.

#### Three-Layer Logging

1. **Frontend Logger:** Browser console + in-memory buffer → sends to Rust
2. **Store Logger:** Automatic Zustand action tracking via middleware
3. **Rust File Logger:** Persists to disk with rotation (`~/Library/Logs/pyreportal/` on macOS, `~/.config/pyreportal/logs/` on Linux)

#### Runtime Configuration

API keys loaded at runtime via Rust (not baked into frontend build):

```
.env file → Rust reads env vars → Frontend calls get_api_config() → API configured
```

Never use `VITE_*` for secrets (they're embedded in the build).

### Testing Strategy

- **Frontend:** Type checking + linting (`npm run check`). No unit test framework currently.
- **Backend:** Rust unit tests (`cargo test`)
- **Hardware:** Shell scripts (`test_rfid.sh`, `test_rfid_persistent.sh`) compile and run RFID test binaries on Pi

### Git Workflow

- **Hooks:** Husky pre-commit runs `lint-staged` (Prettier + ESLint auto-fix)
- **Commits:** Conventional commits encouraged
- **Branches:** Feature branching from `development`

## Domain Context

### Entities

- **Staff/Teachers:** Authenticate via 4-digit PIN. Have roles and permissions.
- **Students:** Identified by RFID tag (NFC card). Check in when arriving, check out when leaving.
- **Rooms:** Physical locations in the facility. Can be occupied or available.
- **Activities:** Time-bound sessions in rooms. Have category, supervisor, and satisfaction metrics.
- **Sessions:** Staff work sessions that prevent automatic logout timeout.

### Authentication Flow

1. Staff enters PIN → validated against backend
2. On success, staff can start scanning students
3. Student taps RFID card → server processes check-in/check-out
4. Result displayed immediately (success, error, or conflict resolution)

### Two-Level API Authentication

All API requests include:

- `Authorization: Bearer {DEVICE_API_KEY}` — Device-level auth
- `X-Staff-PIN: {pin}` — Staff-level auth (most endpoints)
- `X-Staff-ID: {id}` — Optional staff identification

## Important Constraints

- **Platform:** Primary target is Raspberry Pi 5 (ARM64 Linux). Also runs on macOS/Windows for development.
- **Performance:** Must maintain 30+ FPS on Pi. Use React.memo, batch state updates, minimize IPC calls.
- **64-bit Required:** 32-bit Pi builds have ~50% worse performance (15-25 FPS). Always use 64-bit.
- **Offline Capability:** Sync queue exists for offline operation (planned enhancement).
- **Security:** No secrets in frontend code. PIN validation happens server-side. Account lockout after failed attempts.
- **Fullscreen Kiosk:** Runs without window decorations in production (`TAURI_FULLSCREEN=true`).

## External Dependencies

- **Project Phoenix API:** Central backend for all data operations. Required for production use.
- **Tauri Plugin Opener:** Opening external links from the app.
- **FontAwesome:** Icon library for UI elements.
