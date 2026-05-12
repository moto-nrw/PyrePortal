# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Ecosystem

PyrePortal is part of a three-repo system. All repos live side-by-side (`../`):

| Repo                                        | Role                          | Relationship                                                                                     |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **project-phoenix** (`../project-phoenix/`) | Go backend + Next.js frontend | Provides `/api/iot/*` endpoints. Source of truth for all students, staff, rooms, sessions, tags. |
| **moto-balenaOS** (`../moto-balenaOS/`)     | Retired deployment layer      | Legacy Raspberry Pi/Balena target. Do not add new PyrePortal work for this target.               |

**If the backend changes**: Error messages in `src/services/api.ts` are hardcoded mappings from backend error strings to German UI text. Backend error text changes break the mapping silently; users see generic fallback messages instead of specific messages.

## Project Overview

PyrePortal is a web kiosk frontend for German after-school care (OGS). Staff use NFC/RFID wristbands for student check-in/check-out, rooms, activities, and attendance.

Supported targets:

- **GKT/GKTL**: production target. NFC comes from the GKT `system.js` bridge.
- **Browser/Mac mock**: local development target. Mock RFID scans are generated in the frontend.

The Raspberry Pi/Tauri/Balena target is retired. Its source can remain during staged cleanup, but it is no longer built, tested, released, or deployed.

## Development Commands

```bash
pnpm run dev          # Browser/mock development
pnpm run build:gkt    # Production GKT bundle
pnpm run build        # Browser/mock production build
pnpm run check        # ESLint + TypeScript
pnpm run test         # Vitest
pnpm run format       # Auto-format with Prettier
```

Do not add new CI, release, or deployment work for the retired Tauri/Raspberry Pi target.

## Critical Architecture Patterns

### 1. Server-First RFID Scanning

**Location**: `src/hooks/useRfidScanning.ts`

RFID actions must be authoritative. The backend is the source of truth; there is no local student cache.

```typescript
const serverResult = await api.processRfidScan(...);
setScanResult(serverResult);
showScanModal();
```

When modifying scanning logic:

- Test rapid scans less than one second apart.
- Verify offline to online transitions.
- Verify both GKT real-NFC mode and browser mock mode.

### 2. Multi-Layer Duplicate Prevention

**Location**: `src/store/userStore.ts`

RFID hardware and browser mocks can emit duplicate scan events. The store defends with:

1. Processing queue for tags currently being processed.
2. Recent tag scan window.
3. Student history to block opposite actions immediately after a scan.

### 3. Platform Adapter Boundary

**Location**: `src/platform/*`

`BUILD_TARGET` chooses which adapter Vite bundles:

- `BUILD_TARGET=gkt`: production GKT adapter.
- default/browser: browser mock adapter.
- `tauri`: legacy adapter only. Do not expand this path.

New platform behavior should go through the adapter interface instead of branching throughout UI code.

### 4. Logging

Use `createLogger('ComponentName')` from `src/utils/logger.ts`.

```typescript
logger.info('RFID scan completed', { tagId, studentId, action });
```

Rules:

- Log messages must be English.
- UI-facing strings stay German.
- Use structured data objects instead of template-literal log messages.
- Do not add prefixes like `[DEBUG]`; use the proper log level.

## API Integration

### Local Browser Development

```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_DEVICE_API_KEY=dev_device_key
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,...
```

### GKT Deployment

- `VITE_API_BASE_URL` is set during `pnpm run build:gkt`.
- The device API key is provided via the kiosk URL query parameter: `?key=...`.

### Authentication Pattern

All relevant requests use:

```typescript
headers: {
  'Authorization': `Bearer ${DEVICE_API_KEY}`,
  'X-Staff-PIN': pin,
  'X-Staff-ID': staffId.toString()
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

## Releasing

See `.claude/rules/release.md` for the full release checklist.

Key rules:

- Run `./scripts/check-version.sh` before release work.
- GKT deploys are the production path.
- Version source is `package.json`.
- This repo is public. Never commit secrets, API keys, `.env` files, PINs, or credentials.

## Adding New Features

### Adding API Endpoints

1. Define types in `src/services/api.ts`.
2. Add an API method that uses the existing auth/header helpers.
3. Add store actions in `src/store/userStore.ts` when state is needed.
4. Use German UI messages for user-facing errors.
5. Add or update focused tests for the changed behavior.

### Adding Platform Behavior

Prefer the platform adapter boundary:

- GKT-specific native behavior belongs in `src/platform/gkt`.
- Browser/mock behavior belongs in `src/platform/browser`.
- Do not add new functionality to the retired Tauri path.

## Working with RFID

Browser development uses mock scanning:

```bash
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,...
```

GKT production scanning uses `SYSTEM.registerNfc` via `public/system.js`.

Hook usage:

```typescript
const { isScanning, startScanning, stopScanning, currentScan, showModal } = useRfidScanning();
```

## TypeScript Configuration

`tsconfig.json` enforces strict mode:

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- no implicit `any`
- explicit null/undefined handling

ESLint enforces import ordering, React hooks rules, security checks, and consistent type imports.

## Performance

- Use `React.memo` for expensive components.
- Batch Zustand `set()` calls where possible.
- Avoid unnecessary native/platform calls.
- Prefer CSS transforms for animations.

## Troubleshooting

### RFID Issues

1. Browser/mock: verify `VITE_MOCK_RFID_TAGS`.
2. GKT: verify `system.js` is injected in the GKT build.
3. Console: look for scanner initialization and scan event logs.

### API Issues

1. Check `VITE_API_BASE_URL` for browser builds or GKT build env.
2. Check the GKT URL contains `?key=...`.
3. Backend running: `curl http://localhost:8080/health`.

### Build Issues

```bash
rm -rf node_modules dist
pnpm install
pnpm run build:gkt
```
