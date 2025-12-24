# Project Context

## Purpose

**PyrePortal** is a Raspberry Pi kiosk application for German after-school care programs (OGS - Offene Ganztagsschule). It provides RFID-based student check-in/check-out functionality for staff managing daily attendance.

**Core Goals:**

- Enable fast, reliable student attendance tracking via RFID card scanning
- Operate in fullscreen kiosk mode on Raspberry Pi 5 hardware
- Support offline operation with background sync when connectivity resumes
- Provide instant visual feedback (<10ms) for scan operations

**Target Users:** OGS staff at German schools who supervise students during after-school hours.

## Tech Stack

### Frontend

- **React 19** with TypeScript 5.9 (strict mode)
- **Zustand 5** for state management (single store pattern)
- **Tailwind CSS 4** for styling
- **React Router 7** for navigation
- **FontAwesome** for icons

### Backend (Tauri)

- **Tauri v2** - Desktop application framework
- **Rust 2021 Edition** - Native system access, RFID hardware integration
- **Tokio** - Async runtime for background tasks

### Hardware Integration

- **MFRC522** - RFID reader via SPI (Raspberry Pi only)
- **rppal** - Raspberry Pi GPIO/SPI access

### Build & Tooling

- **Vite 7** - Frontend bundler
- **ESLint 9** with TypeScript, React, Security plugins
- **Prettier** with Tailwind plugin
- **Husky + lint-staged** - Pre-commit hooks

### External Services

- **Project Phoenix API** - Backend for student data, authentication, session management

## Project Conventions

### Code Style

**TypeScript:**

- Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`)
- Consistent type imports: `import { api, type Teacher } from ...`
- Explicit null/undefined handling required
- No implicit `any` types

**Naming:**

- React components: `PascalCase` (e.g., `ActivityScanningPage.tsx`)
- Hooks: `useCamelCase` (e.g., `useRfidScanning.ts`)
- Utilities: `camelCase` (e.g., `logger.ts`)
- Constants: `SCREAMING_SNAKE_CASE`

**Imports (enforced by ESLint):**

```typescript
// Order: external → internal → parent → sibling
import { useState } from 'react';

import { useUserStore } from '../store/userStore';
import { type Teacher } from '../services/api';

import { LocalComponent } from './LocalComponent';
```

**Rust:**

- Follow `rustfmt` defaults
- Use `cargo clippy` for linting (strict)
- Error handling via `Result<T, String>` for Tauri commands

### Architecture Patterns

**Cache-First RFID Processing:**

- Check local cache before API calls (instant feedback)
- Background sync with server (non-blocking)
- See `src/hooks/useRfidScanning.ts:118-215`

**Multi-Layer Duplicate Prevention:**

- Processing queue blocks concurrent scans of same tag
- Recent scan buffer blocks re-scans within 2 seconds
- Student history blocks contradictory actions
- See `src/store/userStore.ts:1117-1201`

**Zustand Store with Middleware:**

- Single store pattern (not Redux-style slices)
- Custom logging middleware for action/state visibility
- Batch `set()` calls to avoid cascading renders

**Three-Layer Logging:**

1. Frontend logger → browser console + memory buffer
2. Store middleware → automatic action tracking
3. Rust file logger → persistent logs with rotation

### Testing Strategy

**Current State:** Minimal test coverage (no frontend tests implemented)

**Rust Tests:**

```bash
cd src-tauri && cargo test        # Unit tests
cd src-tauri && ./test_rfid.sh    # Hardware integration test
```

**Manual Testing:**

- RFID: Use mock tags via `VITE_MOCK_RFID_TAGS` env var
- UI: `npm run dev` for hot-reloading frontend
- Full app: `npm run tauri dev` for Tauri integration

### Git Workflow

**Branch Strategy:**

- `development` - Main integration branch (PRs target here)
- `feature/*` - New features (e.g., `feature/modal-dismiss-outside-138`)
- `fix/*` - Bug fixes (e.g., `fix/fontawesome-icons-140`)

**Commit Convention (Conventional Commits):**

```
type(scope): description

# Types: feat, fix, refactor, chore, perf, docs, test
# Scope: ui, api, rfid, store, ci, etc.
# Reference issues: feat(#138): description
```

**Examples:**

```
feat(#138): enable modal dismiss by clicking outside overlay
fix(ui): add explicit FontAwesome CSS import for production builds
refactor(ui): extract duplicated back button code into BackButton component
perf(ci): optimize GitHub Actions for faster PR checks
```

**Pre-commit Hooks:**

- Prettier formatting on staged files
- ESLint fix on TypeScript files

## Domain Context

**OGS (Offene Ganztagsschule):**

- German after-school care program for primary school students
- Staff supervise students from end of school day until pickup
- Parents/guardians pick up children at various times

**Key Domain Terms:**

- **Checkin/Checkout**: Student arrival/departure from OGS
- **Schulhof**: Schoolyard - a special supervised outdoor area
- **Activity Session**: Staff-initiated session for tracking attendance
- **PIN**: 4-digit staff authentication code
- **RFID Tag**: Student identification card

**Workflow:**

1. Staff authenticates with PIN
2. Staff selects room/activity for session
3. Students scan RFID cards on arrival/departure
4. System tracks attendance and displays confirmation
5. Staff can view current attendees and perform daily checkout

## Important Constraints

**Hardware:**

- Target: Raspberry Pi 5 (64-bit ARM) with MFRC522 RFID reader
- Fullscreen kiosk mode (no window chrome)
- Touch screen as primary input
- Physical RFID reader for student cards

**Performance:**

- RFID scan feedback must be <10ms (use cache, not network)
- 30-45 FPS minimum on Pi 5 (64-bit builds required)
- Minimize Tauri IPC calls (batch when possible)

**Security:**

- API keys must be runtime-configurable (not baked into build)
- Device-level authentication via `DEVICE_API_KEY`
- Staff-level authentication via PIN codes
- No sensitive data in VITE\_\* environment variables

**Localization:**

- UI is German-only (target audience)
- All user-facing strings in German

**Offline Operation:**

- Must function with cached student data when network unavailable
- Sync queue for offline actions

## External Dependencies

**Project Phoenix API:**

- Backend service for student/staff data
- Authentication via device API key + staff PIN
- Endpoints: `/api/iot/teachers`, `/api/iot/checkin`, `/api/iot/session/*`
- See `src/services/api.ts` for full endpoint documentation

**Environment Configuration:**

```bash
# Runtime (Rust reads these)
API_BASE_URL=http://localhost:8080
DEVICE_API_KEY=device_secret_key_here
TAURI_FULLSCREEN=false

# Build-time (Frontend)
VITE_ENABLE_RFID=false              # true for real hardware
VITE_MOCK_RFID_TAGS=04:D6:94:...    # Mock tags for development
```
