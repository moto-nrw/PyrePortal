# PyrePortal Project Documentation

## 1. Project Overview

- **Business Purpose**: PyrePortal is a Tauri-based desktop client for the Project Phoenix system, providing staff with tooling to manage room occupancy, create activities, and track attendance in educational or organizational programs via RFID workflows (`README.md:10-21`).
- **Target Users/Audience**: Designed for on-site coordinators in OGS-style after-school programs and school administrators who need kiosk-like terminals for rapid student check-in/out (`README.md:10-21`, `WORKING_KIOSK_SETUP.md:5-12`).
- **Key Features & Capabilities**:
  - PIN-authenticated login and staff selection flows (`src/pages/PinPage.tsx:1-214`, `src/store/userStore.ts:82-185`).
  - Activity lifecycle management, room selection, and supervisor assignment (`src/pages/HomeViewPage.tsx:1-214`, `src/store/userStore.ts:186-213`).
  - RFID scanning with optimistic UI updates, offline queuing, and background synchronization (`src/hooks/useRfidScanning.ts:1-200`, `src/services/syncQueue.ts:1-186`).
  - Comprehensive multi-layer logging (frontend, Zustand store middleware, and Rust backend persistence) (`src/utils/logger.ts:1-200`, `src/utils/storeMiddleware.ts:283-360`, `src-tauri/src/logging.rs:1-120`).
  - Real API integration endpoints for teachers, sessions, and RFID check-ins (`src/services/api.ts:25-720`).
- **Current Development Stage**: Version 0.1.0 with core teacher integration delivered, ongoing work on PIN validation, room integration, RFID workflows, and offline improvements, and a roadmap for audit logging and advanced recovery (`package.json:2-55`, `README.md:23-48`).

## 2. Technical Architecture

- **Tech Stack & Versions**:
  - Frontend: React 18.3.1, TypeScript ~5.6.2, React Router 7.6.0, Zustand 5.0.4, TailwindCSS 4.1.6, Vite 6.0.3 (`package.json:19-55`).
  - Native Shell: Tauri 2.5.1 runtime, Tauri CLI ^2, Tauri Plugin Opener 2.2.6 (`Cargo.lock:3701-3715`, `Cargo.toml:21-44`).
  - Rust Backend: Tokio 1.45.0, Serde 1.0.219, Chrono 0.4, dotenvy 0.15 (`Cargo.toml:21-36`, `Cargo.lock:3230-3235`, `Cargo.lock:4072-4076`).
  - Raspberry Pi RFID (conditional): mfrc522 0.8.0 (eh02), rppal 0.14.1, embedded-hal 0.2.7, linux-embedded-hal 0.3.2 (`Cargo.toml:31-36`).
  - Tooling: ESLint 9.26.0 w/ Flat config, TypeScript-ESLint 8.32.1, Prettier 3.5.3 + Tailwind plugin, PostCSS 8.5.3 (`package.json:30-55`).
- **Architecture Pattern**: Single-repo monolith combining a React SPA and a Tauri Rust backend. The frontend renders inside a WebView, communicates with Rust via Tauri invoke, and persists data using Tauri commands for logging, session state, and student cache (`src/App.tsx:31-160`, `src-tauri/src/lib.rs:55-97`).
- **Directory Structure & Responsibilities**:
  - Root config (`package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `eslint.config.js`) orchestrates the web build pipeline.
  - `src/` contains the React application with `components/`, `pages/`, `hooks/`, `services/`, `store/`, `styles/`, `utils/`, and static assets (`ls src`).
  - `src-tauri/` hosts the Rust-side commands, logging, RFID bindings, and bundler config (`src-tauri/src/lib.rs:1-97`, `src-tauri/tauri.conf.json:6-28`).
  - `docs/` captures operational guides (logging, performance, kiosk setup), `dist/` holds Vite output, `src-tauri/target/` stores compiled binaries (`docs/performance-testing.md:1-172`, `WORKING_KIOSK_SETUP.md:1-200`).
- **Package/Module Relationships**:
  - Routed components (`src/App.tsx:31-160`) drive high-level flows, each page orchestrates store actions (Zustand) and services.
  - `useUserStore` centralizes state, depending on `services/api`, `services/sessionStorage`, `services/studentCache`, and `services/syncQueue` (`src/store/userStore.ts:1-1551`).
  - Hooks provide cross-cutting concerns: network health (`src/hooks/useNetworkStatus.ts:1-200`), RFID scanning (`src/hooks/useRfidScanning.ts:1-200`).
  - Utilities wrap Tauri context detection, logging, and store middleware to route data to Rust commands (`src/utils/tauriContext.ts:1-80`, `src/utils/logger.ts:1-200`).
- **Dependency Graph Highlights**:
  - React components -> Zustand store -> API service -> fetch/Tauri invoke -> Rust commands -> file system/hardware.
  - Frontend logging (`src/utils/logger.ts`) persists via `safeInvoke('write_log')` to Rust logging module (`src-tauri/src/logging.rs:1-120`).
  - RFID service initializer triggers Tauri commands, with fallback behavior when not in Tauri context (`src/components/RfidServiceInitializer.tsx:1-30`, `src/utils/tauriContext.ts:41-80`).

## 3. Codebase Patterns & Conventions

### TypeScript/JavaScript

- **Compiler Settings**: ES2020 target and libs, ESNext modules, bundler resolution, JSX via `react-jsx`, strict mode with aggressive unused checks (`tsconfig.json:2-24`). Node-specific config stored separately for Vite (`tsconfig.node.json:1-11`).
- **Type Definitions**: Extensive interfaces/enums for domain entities (activities, rooms, sessions, RFID states) within the store and API service ensuring strong typing across actions (`src/store/userStore.ts:34-200`, `src/services/api.ts:139-720`).
- **Module System**: Pure ESM—`package.json` declares `"type": "module"` (`package.json:5`), enabling native `import` statements throughout `.ts/.tsx`.
- **Import/Export Patterns**: Components and utilities default-export for ergonomic usage; barrel file in `components/ui/index.ts` consolidates shared UI exports (`src/components/ui/index.ts:1-8`). Type-only imports enforced with `@typescript-eslint/consistent-type-imports` rule (`eslint.config.js:85-101`).
- **Naming Conventions**: PascalCase for React components (`ContentBox`, `NetworkStatus`), camelCase for hooks and utilities (`useNetworkStatus`, `safeInvoke`), uppercase enums (`ActivityCategory`) (`src/components/ui/ActionButton.tsx:1-43`, `src/utils/tauriContext.ts:8-80`).

### File Organization

- **Components**: Shared UI primitives live under `src/components/ui`, while workflow-specific components (e.g., RFID initializer, session toggle) reside in `src/components` (`src/components/RfidServiceInitializer.tsx:1-30`).
- **Pages**: Route-level layouts in `src/pages` encapsulate flows like landing, PIN entry, home dashboard, NFC scanning (`src/pages/HomeViewPage.tsx:1-214`).
- **Services**: API access, session storage, student cache, and sync queue logic centralized under `src/services` (`src/services/api.ts:1-720`, `src/services/syncQueue.ts:1-260`).
- **State**: Single Zustand store in `src/store/userStore.ts` couples UI state, optimistic updates, and persistence integration.
- **Utilities & Styles**: Logging, error boundaries, Tauri detection, and design tokens live in `src/utils` and `src/styles` (`src/utils/logger.ts:1-200`, `src/styles/designSystem.ts:1-140`).
- **Tests**: No automated tests present; repo search shows no `.test.*` files and no npm test scripts (`package.json:6-17`).

### Code Style

- **ESLint**: Powered by Flat config plus `typescript-eslint`, `react`, `react-hooks`, `import`, `jsx-a11y`, and `security` plugins with tailored rules (import ordering, hook enforcement, Tauri invoke guardrails) (`eslint.config.js:16-152`).
- **Prettier**: 100-column width, 2-space indentation, semicolons enforced, single quotes for JS/TS, Tailwind class sorting via plugin (`prettier.config.js:1-25`).
- **Formatting Preferences**: Tailwind content scanning limited to `index.html` and `src/**/*` for new JIT CLI (`tailwind.config.js:2-19`); postcss relies on `@tailwindcss/postcss` + autoprefixer (`postcss.config.js:1-5`).
- **Import Ordering**: Alphabetized groups with blank lines between categories enforced via `import/order` rule (`eslint.config.js:51-60`).

## 4. Testing Strategy

- **Frameworks**: None configured yet; `package.json` lacks test scripts, and repository has no Vitest/Jest setup (`package.json:6-17`).
- **Structure & Organization**: No test directories or fixtures present; all validation performed manually per documentation.
- **Coverage Requirements**: Not defined; no tooling for coverage tracking is configured.
- **Mocking Strategies**: Application-level mocks exist for RFID (mock interval when `VITE_ENABLE_RFID=false`) and cached student responses within the store/hook, but no formal testing mocks (`src/hooks/useRfidScanning.ts:119-198`).
- **Integration vs Unit Patterns**: None implemented; future tests would need to wrap Zustand store and Tauri invoke calls.
- **E2E Testing**: Not available—manual kiosk scripts cover deployment validation instead (`WORKING_KIOSK_SETUP.md:1-200`).

## 5. Build & Development

- **Package Manager**: npm with lockfileVersion 3 (requires npm ≥9); continuous usage in scripts and Docker build (`package-lock.json`, `docker-build-pi.sh:69-72`).
- **Build Tools**: Vite 6.0.3 bundling React and Tailwind; TypeScript compiler for type checks; Tauri CLI orchestrates Rust/Web build and packaging (`package.json:6-17`, `vite.config.ts:1-32`, `tsconfig.json:2-24`).
- **Development Workflow**:
  1. Install dependencies: `npm install`.
  2. Frontend-only dev: `npm run dev` (Vite dev server).
  3. Full-stack dev with Rust backend: `npm run tauri dev`.
  4. Quality checks: `npm run check` (ESLint + `tsc --noEmit`), `npm run lint`, `npm run typecheck`, `npm run format:check` (`package.json:6-17`, `CLAUDE.md:32-60`).
- **Build & Packaging**:
  - Web build: `npm run build` (`tsc && vite build`), output to `dist/`.
  - Tauri bundle: `npm run tauri build`, packaging via `src-tauri/tauri.conf.json:6-28`.
  - Cross-compilation for Raspberry Pi using Docker script for ARM target (`docker-build-pi.sh:1-77`).
- **Environment Setup**:
  - Node ≥18, Rust stable, platform-specific system deps for Tauri (GTK/webkit) (`README.md:94-101`).
  - App configuration via `.env`, `.env.example` enumerating API URLs, device keys, full-screen toggles, RFID toggles, and mock tags (`.env.example:1-26`).
- **Hot Reload/Watch Mode**: Vite dev server locked to port 1420 and custom HMR port 1421 for Tauri compatibility; watchers ignore `src-tauri` to avoid redundant restarts (`vite.config.ts:11-31`).

## 6. Dependencies & Integrations

- **Critical Dependencies**:
  - React & ReactDOM for UI (`src/main.tsx:1-11`), React Router for navigation gating (`src/App.tsx:99-156`).
  - Zustand for centralized state with logging middleware (`src/store/userStore.ts:1-1551`, `src/utils/storeMiddleware.ts:283-360`).
  - FontAwesome icons for status indicators (e.g., network widget) (`src/components/ui/NetworkStatus.tsx:1-100`).
  - Tailwind and bespoke design system tokens for consistent styling (`src/styles/designSystem.ts:1-140`, `tailwind.config.js:2-19`).
  - Tauri API/CLI bridging WebView and native commands (`package.json:23-24`, `Cargo.toml:21-36`).
- **Internal Package Dependencies**: Store uses service modules for API, session storage, and student cache, with middleware handing logs to `logger.ts` for persistence (`src/store/userStore.ts:1-1551`).
- **External APIs & Services**:
  - Project Phoenix endpoints handled via centralized `api.ts`, including `/api/iot/teachers`, `/api/iot/status`, `/api/iot/rooms/available`, `/api/iot/session/*`, `/api/iot/checkin`, `/health` (`src/services/api.ts:139-720`).
  - Device authentication uses Bearer token (`DEVICE_API_KEY`) plus per-request `X-Staff-PIN` headers and optional `X-Staff-ID` (`src/services/api.ts:213-320`).
- **Authentication & Authorization**:
  - Global PIN validation to unlock device context (global staff, fallback messages) (`src/services/api.ts:206-272`).
  - State-managed staff PIN with stored PIN to reuse across requests (`src/store/userStore.ts:82-185`).
  - No OAuth/third-party login; purely header-based token + PIN.
- **Data Persistence & Storage**:
  - Session settings and student caches persisted via Tauri commands writing JSON files into app data directory (`src-tauri/src/session_storage.rs:1-120`, `src-tauri/src/student_cache.rs:1-200`).
  - Logs persisted per day through Tauri logging module (`src-tauri/src/logging.rs:1-120`).
  - No direct database connection; relies on remote API.
- **Hardware Integrations**:
  - RFID background service with `OnceLock` global, tokio spawn, and Raspberry Pi-specific modules (`src-tauri/src/rfid.rs:1-200`).
  - Frontend RFID hook toggles between real hardware (via `safeInvoke`) and mock intervals for development (`src/hooks/useRfidScanning.ts:67-198`).

## 7. Common Workflows

- **Adding a New Feature**:
  1. Scaffold route/page or component under `src/pages` or `src/components`, using existing design tokens (`src/styles/theme.ts:1-93`, `src/styles/designSystem.ts:1-140`).
  2. Add state to `useUserStore` if needed, ensuring actions are logged and optionally persisted or cached (`src/store/userStore.ts:140-1551`).
  3. Integrate APIs via `src/services/api.ts`, extending type definitions and reusing `apiCall` for consistent logging and error handling (`src/services/api.ts:66-137`).
  4. Update router and gating logic in `src/App.tsx` as required (`src/App.tsx:99-156`).
  5. Run `npm run check` and `npm run format:check`.
- **Fixing a Bug**:
  1. Reproduce issue with `npm run tauri dev` to include backend logging.
  2. Inspect logs via in-app log viewer (if wired) or `get_log_files` command invoked through Tauri (`src/utils/logViewer.tsx:1-120`, `src-tauri/src/logging.rs:1-120`).
  3. Adjust store/actions/hooks, leveraging middleware diffs for state change diagnostics (`src/utils/storeMiddleware.ts:283-360`).
  4. Re-run lint/typecheck before commit.
- **Running Diagnostics/Tests**: No automated suite—developers rely on manual flows. For Rust, optional `cargo check` or `cargo test` (if tests added) inside `src-tauri/` (`CLAUDE.md:60-83`).
- **Creating a Build**:
  - Web bundle: `npm run build`, outputs to `dist/` consumed by Tauri bundler.
  - Native package: `npm run tauri build`, reading config from `src-tauri/tauri.conf.json:6-28`.
  - Cross-compile for ARM kiosk with `./docker-build-pi.sh` (`docker-build-pi.sh:1-77`).
- **Git Workflow**: No explicit branching or PR convention documented; contributors rely on standard feature-branching guided by `CLAUDE.md` best practices.
- **Deployment Process**:
  - Desktop: distribute artifacts from `src-tauri/target/release/bundle`.
  - Raspberry Pi kiosks: follow kiosk script to configure X11 rotation, env vars, and auto-start service (`WORKING_KIOSK_SETUP.md:1-200`).
  - Performance tuning references available in `docs/performance-testing.md` for hardware validation.

## 8. Error Handling

- **Patterns**:
  - Global React error boundary logs errors and renders fallback UI (`src/utils/errorBoundary.tsx:15-68`).
  - API layer wraps fetches, producing enriched error messages with status + detail and logging timings and quality (`src/services/api.ts:66-137`).
  - Hooks and store actions catch errors, log via `createLogger`, and update UI state (e.g., PIN failure modals, RFID duplicates) (`src/pages/PinPage.tsx:103-213`, `src/hooks/useRfidScanning.ts:83-198`).
- **Logging Approach**:
  - Frontend `Logger` class handles log levels, circular buffer, console output, and optional persistence via Tauri (`src/utils/logger.ts:1-200`).
  - Store middleware records action IDs, diffs, and caller info for debugging complex state transitions (`src/utils/storeMiddleware.ts:283-360`).
  - Rust `logging.rs` writes JSONL log files per day, with commands to list, read, clear, and prune logs (`src-tauri/src/logging.rs:1-120`).
- **Monitoring/Observability**:
  - No external telemetry or monitoring integrations. Observability relies on local logs, student cache stats (`src-tauri/src/student_cache.rs:1-200`), and performance logging via `Performance` API (e.g., PIN verification measurements, `src/pages/PinPage.tsx:160-200`).
  - Manual performance data maintained in `docs/performance-testing.md:1-172`.

## 9. Project-Specific Quirks

- **Architectural Decisions**:
  - **Tauri context detection** prevents invoking native commands when running pure web builds. Missing context surfaces explicit errors guiding developers to start `tauri dev` (`src/utils/tauriContext.ts:41-80`).
  - **Optimistic RFID UX** uses cache-first responses and background sync to deliver instant feedback, plus duplicate prevention via short-term maps and processing queues (`src/hooks/useRfidScanning.ts:91-198`, `src/store/userStore.ts:120-168`).
  - **Daily Student Cache** resets per-day JSON files to avoid stale data (`src-tauri/src/student_cache.rs:33-120`, `src/services/studentCache.ts:11-120`).
  - **Automatic Sync Queue** replays failed check-ins with retry/backoff, useful in poor network kiosks (`src/services/syncQueue.ts:42-186`).
- **Known Issues / Workarounds**:
  - PIN validation and room selection integration still in progress; flows fallback to placeholders (`README.md:34-41`, `src/services/api.ts:213-400`).
  - No automated tests; manual QA required.
  - Raspberry Pi build requires heavy cross-compilation steps; `docker-build-pi.sh` includes numerous dependencies and diagnostic commands (`docker-build-pi.sh:6-72`).
- **Performance Considerations**:
  - Kiosk boot optimizations and hardware comparisons documented extensively (`docs/performance-testing.md:1-172`).
  - RFID loop uses tokio tasks and prevents duplicate event floods with gating and `setTimeout` windows (`src-tauri/src/rfid.rs:111-200`, `src/hooks/useRfidScanning.ts:91-198`).
- **Security Requirements**:
  - API key must be provided via runtime env; application aborts if missing to avoid unsecured requests (`src/services/api.ts:32-54`, `src-tauri/src/lib.rs:17-32`).
  - Security linting warns against non-literal filesystem access and restricts Node globals (`eslint.config.js:70-149`).
  - Sensitive kiosk doc contains real API key—should be managed carefully (`WORKING_KIOSK_SETUP.md:118`).
- **Areas Requiring Special Attention**:
  - Any changes to `useUserStore` must consider logging middleware side effects and persistence flows.
  - Tauri commands must include error handling to satisfy custom lint rule for `invoke` usage (`eslint.config.js:125-133`).
  - Student cache file formats shared between TS and Rust must remain in sync.

## 10. File Inventory

- **Configuration Files**:
  - `package.json:2-55` – Project metadata, scripts, dependency versions.
  - `tsconfig.json:2-24`, `tsconfig.node.json:1-11` – TypeScript compiler config (browser & node contexts).
  - `vite.config.ts:1-32` – Build and dev server customization for Tauri (ports, HMR, watch ignore).
  - `tailwind.config.js:2-19`, `postcss.config.js:1-5` – Styling pipeline.
  - `eslint.config.js:16-152`, `prettier.config.js:1-25`, `.prettierignore:1-17` – Linting/formatting policies.
  - `src-tauri/tauri.conf.json:1-29`, `src-tauri/Cargo.toml:1-44`, `.env.example:1-26` – Native app packaging and environment expectations.
- **Key Source Directories**:
  - `src/components/ui` – Shared UI widgets (`src/components/ui/NetworkStatus.tsx:1-100`, `src/components/ui/ActionButton.tsx:1-90`).
  - `src/pages` – Route-level screens (e.g., `src/pages/HomeViewPage.tsx:1-214`, `src/pages/PinPage.tsx:1-214`).
  - `src/services` – API, caching, session storage, sync queue (`src/services/api.ts:1-720`, `src/services/studentCache.ts:1-200`).
  - `src/store` – Zustand store composition and middleware integration (`src/store/userStore.ts:1-1551`).
  - `src/hooks` – Cross-cutting logic for network and RFID (`src/hooks/useNetworkStatus.ts:1-200`, `src/hooks/useRfidScanning.ts:1-200`).
  - `src-tauri/src` – Rust commands for API config, logging, RFID, session persistence (`src-tauri/src/lib.rs:1-97`, `src-tauri/src/rfid.rs:1-200`, `src-tauri/src/session_storage.rs:1-120`).
- **Generated/Build Directories to Ignore**:
  - `dist/`, `node_modules/`, `src-tauri/target/`, `src-tauri/gen/`, `.cargo/`, `.idea/` (see `.prettierignore:1-17`, `eslint.config.js:21`).
- **Files Containing/Potentially Containing Sensitive Data**:
  - `.env` (runtime secrets).
  - `.env.example:5-26` (placeholder API keys).
  - `WORKING_KIOSK_SETUP.md:118` (real API key—treat as sensitive).
  - `rfid-dev.log` (may contain scan history).
  - Rust student cache/session files written at runtime (per user data directories via Tauri).

---

**Next Steps**: Consider formalizing automated tests, document Git workflow, and sanitize sensitive credentials in documentation before broader distribution.
