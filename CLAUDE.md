# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Ecosystem

PyrePortal is part of a three-repo system. All repos live side-by-side (`../`):

| Repo                                        | Role                          | Relationship                                                                                     |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **project-phoenix** (`../project-phoenix/`) | Go backend + Next.js frontend | Provides `/api/iot/*` endpoints. Source of truth for all students, staff, rooms, sessions, tags. |
| **moto-balenaOS** (`../moto-balenaOS/`)     | Retired deployment layer      | Legacy Raspberry Pi/Balena target. Do not add new PyrePortal work for this target.               |

**If the backend changes**: Error messages in `src/services/apiErrors.ts` are hardcoded mappings from backend error strings to German UI text. Backend error text changes break the mapping silently; users see generic fallback messages instead of specific messages.

## Project Overview

PyrePortal is a web kiosk frontend for German after-school care (OGS). Staff use NFC/RFID wristbands for student attendance, room changes, activities, tag assignment, pickup-time lookup, and staff time tracking.

Supported targets:

- **GKT/GKTL**: production target. NFC comes from the GKT `system.js` bridge.
- **Wedge**: kiosk target for iPads/tablets with a USB NFC reader in keyboard-emulation mode. See `docs/wedge-reader-setup.md`.
- **Browser mock**: local development target. Mock RFID scans are generated in the frontend.

The Raspberry Pi/Balena and Tauri targets are retired. They are not supported development or release targets. Legacy Tauri source may remain while it is being removed; do not extend it.

## Development Commands

```bash
pnpm run dev          # Browser/mock development
pnpm run dev:wedge    # Wedge development (USB NFC reader types scans)
pnpm run build:gkt    # Production GKT bundle
pnpm run build:wedge  # Production wedge bundle
pnpm run build        # Browser/mock production build
pnpm run check        # ESLint + TypeScript
pnpm run test         # Vitest
pnpm run format       # Auto-format with Prettier
```

Do not add new CI, release, or deployment work for Raspberry Pi, Balena, or Tauri targets.

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

**Location**: `src/store/userStore.ts` and `src/hooks/useRfidScanning.ts`

RFID hardware and browser mocks can emit duplicate scan events. Defense in depth:

1. Processing queue in the store for tags currently being processed.
2. Adapter-level scanId dedup in `useRfidScanning`'s `onAdapterScan`.

### 3. Platform Adapter Boundary

**Location**: `src/platform/*`

`BUILD_TARGET` chooses which adapter Vite bundles:

- `BUILD_TARGET=gkt`: production GKT adapter.
- `BUILD_TARGET=wedge`: keyboard-wedge adapter for tablets with USB NFC readers.
- default/browser: browser mock adapter.

`BUILD_TARGET=tauri` and `src/platform/tauri` are legacy code, not supported targets. Do not add behavior to them.

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

Every API request uses the device bearer token. Staff-authenticated requests add the PIN, and staff-scoped requests add the staff ID when available:

```typescript
headers: {
  'Authorization': `Bearer ${DEVICE_API_KEY}`,
  ...(pin !== undefined && { 'X-Staff-PIN': pin }),
  ...(staffId !== undefined && { 'X-Staff-ID': staffId.toString() })
}
```

### Key Endpoints

| Endpoint                          | Purpose                | Auth         |
| --------------------------------- | ---------------------- | ------------ |
| `GET /api/iot/teachers`           | Fetch staff list       | Device only  |
| `POST /api/iot/ping`              | Validate global PIN    | Device + PIN |
| `POST /api/iot/checkin`           | Process RFID scan      | Device + PIN |
| `POST /api/iot/pickup-query`      | Fetch pickup details   | Device + PIN |
| `POST /api/iot/session/start`     | Start activity session | Device + PIN |
| `POST /api/iot/session/activity`  | Prevent timeout        | Device + PIN |
| `POST /api/iot/staff-clock/state` | Read staff clock state | Device + PIN |
| `POST /api/iot/staff-clock`       | Record staff time      | Device + PIN |
| `GET /api/iot/config`             | Fetch device settings  | Device only  |

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
- Wedge-specific behavior belongs in `src/platform/wedge`.
- Browser/mock behavior belongs in `src/platform/browser`.
- Do not add Tauri behavior; the adapter is legacy code awaiting removal.

## Working with RFID

Browser development uses mock scanning:

```bash
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,...
```

GKT production scanning uses `SYSTEM.registerNfc` via `public/system.js`.

The GKT scan path can be tested locally without a device: run `BUILD_TARGET=gkt VITE_API_BASE_URL=http://localhost:8080 pnpm run dev`, open `http://localhost:1420/?key=<device-api-key>`, and fire a scan from the DevTools console (`registerNfc` stores its callback as `SYSTEM.onNfcScanned`):

```js
SYSTEM.onNfcScanned({ uid: '04:D6:94:82:97:6A:80', eventSource: 'NFC', eventNumber: 1 });
```

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
