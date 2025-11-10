# PyrePortal - Comprehensive Project Documentation

> **Generated**: 2025-10-02
> **Version**: 0.1.0
> **Purpose**: Complete technical reference for Claude Code optimization and developer onboarding

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Codebase Patterns & Conventions](#3-codebase-patterns--conventions)
4. [Testing Strategy](#4-testing-strategy)
5. [Build & Development](#5-build--development)
6. [Dependencies & Integrations](#6-dependencies--integrations)
7. [Common Workflows](#7-common-workflows)
8. [Error Handling](#8-error-handling)
9. [Project-Specific Quirks](#9-project-specific-quirks)
10. [File Inventory](#10-file-inventory)

---

## 1. Project Overview

### Business Purpose

PyrePortal is a **desktop kiosk application** designed for educational settings (specifically German after-school care programs - "OGS"). It provides a physical check-in/check-out system for students using RFID cards, allowing supervisors to track student attendance, room occupancy, and activity participation in real-time.

### Target Users

1. **Primary Users**: OGS staff (teachers/supervisors) who manage student activities
2. **Secondary Users**: Students (passive - they scan RFID cards)
3. **Deployment Environment**: Raspberry Pi 5 kiosks in school rooms, running in fullscreen kiosk mode

### Key Features

1. **Teacher Authentication**

   - PIN-based login system
   - Global OGS PIN for quick access
   - Individual teacher PINs with device binding
   - Automatic session timeout prevention

2. **RFID-Based Check-In/Check-Out**

   - Hardware RFID reader integration (MFRC522 via SPI on Raspberry Pi)
   - Mock RFID scanning for development
   - Cache-first scanning (instant UI feedback, background sync)
   - Duplicate scan prevention (multi-layer)
   - Offline operation with sync queue

3. **Room & Activity Management**

   - Room selection with occupancy status
   - Activity creation and selection
   - Multi-supervisor support
   - Session management with timeout prevention

4. **Comprehensive Logging**

   - Frontend logging (browser console + in-memory)
   - Zustand store action logging
   - Rust backend file logging with rotation
   - Log persistence across app restarts

5. **Network Resilience**
   - Offline operation support
   - Failed operation queueing
   - Automatic retry with exponential backoff
   - Network quality indicators

### Current Development Stage

**Status**: Active development, pre-production testing

- ✅ **Completed**: Core authentication, RFID scanning, session management, logging system
- 🔧 **In Progress**: Offline sync refinement, attendance analytics
- 📋 **Planned**: Biometric auth, advanced reporting, multi-device synchronization

---

## 2. Technical Architecture

### Tech Stack

#### Frontend

- **Framework**: React 18.3.1
- **Language**: TypeScript 5.6.2 (strict mode)
- **Build Tool**: Vite 6.0.3
- **Styling**: Tailwind CSS 4.1.6 with custom theme
- **Routing**: React Router DOM 7.6.0
- **State Management**: Zustand 5.0.4 with custom middleware
- **Icons**: FontAwesome 6.7.2
- **Runtime**: Tauri v2.5.0 (desktop app framework)

#### Backend (Rust)

- **Framework**: Tauri 2.x
- **Language**: Rust (2021 edition)
- **Async Runtime**: Tokio 1.x with multi-thread support
- **Serialization**: Serde 1.x
- **Environment**: dotenvy 0.15 for .env loading
- **Hardware**: RFID reader support via mfrc522, rppal, embedded-hal (ARM/ARM64 Linux only)

#### External Services

- **Backend API**: Project Phoenix (Node.js/Express backend)
- **API Communication**: REST with device API key + staff PIN authentication

### Architecture Pattern

**Desktop Application with Client-Server Communication**

```
┌─────────────────────────────────────┐
│   PyrePortal Desktop App (Tauri)    │
│  ┌────────────────────────────────┐ │
│  │  React Frontend (Vite)         │ │
│  │  - UI Components               │ │
│  │  - Zustand Store               │ │
│  │  - API Service Layer           │ │
│  └────────────┬───────────────────┘ │
│               │ IPC (Tauri Commands)│
│  ┌────────────▼───────────────────┐ │
│  │  Rust Backend                  │ │
│  │  - RFID Hardware               │ │
│  │  - File System (Logging)       │ │
│  │  - Configuration               │ │
│  └────────────┬───────────────────┘ │
└───────────────┼─────────────────────┘
                │ HTTP REST API
┌───────────────▼───────────────────┐
│   Project Phoenix Backend         │
│   - Authentication                │
│   - Student/Staff Data            │
│   - Activity Management           │
│   - Room Tracking                 │
└───────────────────────────────────┘
```

### Directory Structure

```
PyrePortal/
├── src/                           # React frontend source
│   ├── assets/                    # Static assets (images, fonts)
│   ├── components/                # React components
│   │   ├── ui/                   # Reusable UI components
│   │   │   ├── ActionButton.tsx  # Large action buttons
│   │   │   ├── BackButton.tsx    # Navigation back button
│   │   │   ├── Button.tsx        # Base button component
│   │   │   ├── ContentBox.tsx    # Content container wrapper
│   │   │   ├── ErrorModal.tsx    # Error display modal
│   │   │   ├── Modal.tsx         # Base modal component
│   │   │   ├── NetworkStatus.tsx # Network indicator
│   │   │   ├── Select.tsx        # Dropdown select
│   │   │   └── SuccessModal.tsx  # Success feedback modal
│   │   ├── InfoModal.tsx         # Information display modal
│   │   ├── LastSessionToggle.tsx # Session persistence toggle
│   │   └── RfidServiceInitializer.tsx # RFID service setup
│   ├── hooks/                     # Custom React hooks
│   │   ├── useNetworkStatus.ts   # Network monitoring hook
│   │   └── useRfidScanning.ts    # RFID scanning logic hook
│   ├── pages/                     # Route components (page views)
│   │   ├── ActivityScanningPage.tsx    # RFID scanning interface
│   │   ├── AttendancePage.tsx          # Attendance management
│   │   ├── CreateActivityPage.tsx      # Activity creation
│   │   ├── HomeViewPage.tsx            # Main dashboard
│   │   ├── LandingPage.tsx             # Initial splash screen
│   │   ├── PinPage.tsx                 # PIN authentication
│   │   ├── RoomSelectionPage.tsx       # Room picker
│   │   ├── StaffSelectionPage.tsx      # Teacher selection
│   │   ├── StudentSelectionPage.tsx    # Student picker
│   │   ├── TagAssignmentPage.tsx       # RFID tag assignment
│   │   ├── TeamManagementPage.tsx      # Team management
│   │   └── UserSelectionPage.tsx       # User selector
│   ├── services/                  # Business logic layer
│   │   ├── api.ts                # API client (947 lines)
│   │   ├── sessionStorage.ts     # Session persistence
│   │   ├── studentCache.ts       # Offline student data cache
│   │   └── syncQueue.ts          # Offline operation queue
│   ├── store/                     # Zustand state management
│   │   └── userStore.ts          # Main application store (1552 lines)
│   ├── styles/                    # Theme and design system
│   │   ├── designSystem.ts       # Design tokens
│   │   └── theme.ts              # Theme configuration
│   ├── utils/                     # Utility functions
│   │   ├── errorBoundary.tsx     # React error boundary
│   │   ├── logger.ts             # Frontend logger (317 lines)
│   │   ├── loggerConfig.ts       # Logger configuration
│   │   ├── logViewer.tsx         # In-app log viewer
│   │   ├── storeLogger.ts        # Store action logger
│   │   ├── storeMiddleware.ts    # Zustand logging middleware
│   │   └── tauriContext.ts       # Tauri API utilities
│   ├── App.tsx                    # Root application component
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Global styles
│
├── src-tauri/                     # Rust backend
│   ├── src/
│   │   ├── bin/                  # Standalone binaries
│   │   │   ├── rfid_test.rs             # RFID hardware test
│   │   │   └── rfid_test_persistent.rs  # Continuous RFID test
│   │   ├── cache/                # Cache management (student data)
│   │   ├── lib.rs                # Main library entry (98 lines)
│   │   ├── main.rs               # Binary entry point
│   │   ├── logging.rs            # File logging system
│   │   ├── rfid.rs               # RFID hardware abstraction
│   │   ├── session_storage.rs    # Session persistence
│   │   └── student_cache.rs      # Student cache implementation
│   ├── capabilities/             # Tauri permissions
│   │   └── default.json          # Default permission set
│   ├── icons/                    # Application icons (all sizes)
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
│
├── public/                        # Static public assets
│   └── img/                      # Application images (icons, graphics)
│
├── docs/                          # Project documentation
│   ├── command-cheatsheet.md     # CLI commands reference
│   ├── logging-guidelines.md     # Logging best practices
│   ├── pi4-native-build.md       # Raspberry Pi build guide
│   ├── performance-testing.md    # Performance benchmarks
│   └── store-logging-guide.md    # Store logging documentation
│
├── .github/                       # GitHub Actions CI/CD
│   ├── actions/
│   │   └── setup-tauri-environment/ # Reusable setup action
│   └── workflows/
│       ├── build.yml             # Build workflow
│       ├── code-quality.yml      # Linting + type checking
│       ├── lint.yml              # ESLint only
│       └── main.yml              # Primary CI pipeline
│
├── .env.example                   # Environment template
├── .prettierrc                    # Prettier config (does not exist - using prettier.config.js)
├── eslint.config.js              # ESLint flat config (153 lines)
├── prettier.config.js            # Prettier config (26 lines)
├── tailwind.config.js            # Tailwind CSS config (21 lines)
├── tsconfig.json                 # TypeScript base config
├── tsconfig.node.json            # TypeScript config for Node files
├── vite.config.ts                # Vite build configuration
├── package.json                  # Node dependencies (57 lines)
├── CLAUDE.md                      # Project-specific Claude instructions
├── CLAUDE.local.md               # Private Claude instructions (not in git)
└── README.md                      # Project overview
```

### Package/Module Organization

#### Frontend Module Hierarchy

1. **Entry Point**: `main.tsx` → `App.tsx`
2. **Routing**: React Router in `App.tsx` defines all page routes
3. **State**: Centralized in `store/userStore.ts` (single store pattern)
4. **Services**: Abstraction layer for external dependencies
   - `api.ts`: All HTTP API calls
   - `sessionStorage.ts`: Tauri IPC for session data
   - `studentCache.ts`: Tauri IPC for student caching
   - `syncQueue.ts`: Offline operation management
5. **Components**: Atomic design pattern
   - `ui/` = atoms/molecules (reusable)
   - `components/` root = organisms (feature-specific)
   - `pages/` = templates/pages (full screens)

#### Rust Module Structure

- **lib.rs**: Main entry, command registration, app setup
- **rfid.rs**: Hardware abstraction + mock support
- **logging.rs**: File-based logging with rotation
- **session_storage.rs**: Persistent session settings
- **student_cache.rs**: Offline student data storage

### Dependency Graph

```
Pages
  └─> Hooks (useRfidScanning, useNetworkStatus)
       └─> Store (userStore)
            ├─> Services (api, sessionStorage, studentCache, syncQueue)
            │    └─> Tauri IPC (tauriContext)
            │         └─> Rust Backend (lib.rs)
            └─> Utils (logger, storeLogger)
```

**Key Dependencies:**

- Pages depend on store actions
- Store depends on services for side effects
- Services depend on Tauri IPC or HTTP API
- All layers can use logger utilities

---

## 3. Codebase Patterns & Conventions

### TypeScript/JavaScript

#### tsconfig.json Settings

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",

    // Strictness
    "strict": true, // ALL strict checks enabled
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    // Bundler settings
    "allowImportingTsExtensions": true, // Allow .ts/.tsx in imports
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true, // Vite handles compilation
    "jsx": "react-jsx", // New JSX transform (no import React)

    // Module behavior
    "skipLibCheck": true, // Skip lib .d.ts checking for speed
    "useDefineForClassFields": true
  },
  "include": ["src"]
}
```

**Key Strictness Implications:**

- All function parameters must be typed
- No implicit `any` types allowed
- Unused variables/imports cause errors
- Null/undefined must be explicitly handled

#### Type Definition Patterns

**Interface vs Type:**

```typescript
// Interfaces for object shapes (preferred for extensibility)
export interface Teacher {
  staff_id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  display_name: string;
}

// Type aliases for unions/primitives
export type ActivityCategory = 'Sport' | 'Wissenschaft' | 'Kunst' | 'Musik';
```

**API Response Typing:**

```typescript
// Generic wrapper pattern for API responses
interface ApiResponse<T> {
  status: string;
  data: T;
  message: string;
}

// Usage:
const response = await apiCall<ApiResponse<Teacher[]>>('/api/iot/teachers');
```

#### Module System

**Type**: ES Modules (ESM) exclusively

- Uses `import` / `export` syntax
- No CommonJS (`require()`)
- Package.json has `"type": "module"`

#### Import/Export Patterns

**Import Order** (enforced by ESLint):

1. Built-in Node modules
2. External packages (npm)
3. Internal modules (absolute paths)
4. Parent directory modules (`../`)
5. Sibling modules (`./`)

**Example:**

```typescript
// 1. External
import { useEffect, useCallback } from 'react';
import { create } from 'zustand';

// 2. Internal services
import { api } from '../services/api';
import type { Teacher } from '../services/api';

// 3. Internal utilities
import { createLogger } from '../utils/logger';
import { safeInvoke } from '../utils/tauriContext';
```

**Type Import Style** (enforced by ESLint):

```typescript
// Inline type imports (preferred)
import { api, type Teacher, type Room } from '../services/api';

// NOT:
import type { Teacher } from '../services/api';
import { api } from '../services/api';
```

#### Naming Conventions

| Type               | Convention               | Example                               |
| ------------------ | ------------------------ | ------------------------------------- |
| Files (Components) | PascalCase               | `ActivityScanningPage.tsx`            |
| Files (Utils)      | camelCase                | `tauriContext.ts`                     |
| Files (Hooks)      | camelCase + `use` prefix | `useRfidScanning.ts`                  |
| React Components   | PascalCase               | `function ErrorModal() {}`            |
| Functions          | camelCase                | `async function processRfidScan() {}` |
| Variables          | camelCase                | `const authenticatedUser = ...`       |
| Constants          | UPPER_SNAKE_CASE         | `const API_BASE_URL = ...`            |
| Interfaces         | PascalCase               | `interface UserState {}`              |
| Types              | PascalCase               | `type LogLevel = ...`                 |
| Enums              | PascalCase (keys UPPER)  | `enum LogLevel { DEBUG = 0 }`         |

### File Organization

#### Co-location Strategy

- **UI Components**: All in `src/components/ui/`
- **Feature Components**: In `src/components/` root
- **Pages**: In `src/pages/` (route components)
- **Hooks**: In `src/hooks/` (NOT co-located with components)
- **Services**: In `src/services/` (centralized business logic)
- **Utils**: In `src/utils/` (pure functions, no side effects)

#### Test File Locations

**Status**: Tests not yet implemented

**Planned Pattern**:

- Tests will be co-located: `Component.tsx` → `Component.test.tsx`
- Test framework: Vitest + React Testing Library

### Code Style

#### ESLint Configuration (eslint.config.js)

**Type**: Flat config (ESLint 9.x)

**Plugins Used:**

- `typescript-eslint` (recommended + strict presets)
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-import`
- `eslint-plugin-jsx-a11y` (accessibility)
- `eslint-plugin-security`
- `eslint-config-prettier` (disables conflicting rules)

**Key Rules:**

```javascript
{
  // React
  'react/react-in-jsx-scope': 'off',      // Not needed with new JSX transform
  'react/prop-types': 'off',               // Using TypeScript instead

  // React Hooks
  'react-hooks/rules-of-hooks': 'error',  // Must follow hooks rules
  'react-hooks/exhaustive-deps': 'warn',   // Dependency array warnings

  // Imports
  'import/first': 'error',                 // Imports at top
  'import/no-duplicates': 'error',         // No duplicate imports
  'import/order': 'warn',                  // Enforce import order (alphabetical)

  // TypeScript
  '@typescript-eslint/consistent-type-imports': 'warn',  // Prefer type imports
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/require-await': 'off',

  // Security
  'security/detect-non-literal-fs-filename': 'error',  // Prevent path injection

  // Tauri-specific
  'no-restricted-globals': ['warn', '__dirname', '__filename'],  // Use Tauri path API
}
```

#### Prettier Configuration

**File**: `prettier.config.js`

```javascript
{
  printWidth: 100,              // Line length target
  tabWidth: 2,                   // 2 spaces per indent
  useTabs: false,                // Spaces not tabs
  semi: true,                    // Always use semicolons
  singleQuote: true,             // Use 'string' not "string"
  trailingComma: 'es5',          // Trailing commas where valid in ES5
  arrowParens: 'avoid',          // (x) => x becomes x => x
  endOfLine: 'lf',               // Unix line endings

  // Tailwind plugin for class sorting
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindConfig: './tailwind.config.js'
}
```

**Override for CSS/JSON:**

```javascript
overrides: [
  {
    files: '*.{css,scss,json,html}',
    options: { singleQuote: false }, // Use double quotes
  },
];
```

#### Import Ordering Example

```typescript
// ✅ CORRECT ORDER (alphabetized within groups):
import { useEffect } from 'react'; // External
import { create } from 'zustand'; // External

import { api, type Teacher } from '../services/api'; // Internal
import { createLogger } from '../utils/logger'; // Internal
```

---

## 4. Testing Strategy

### Current Status

**Tests**: ⚠️ **Not yet implemented**

The project currently has **no test suite**. Testing infrastructure is planned but not configured.

### Planned Testing Approach

#### Test Frameworks (Planned)

Based on the tech stack, the likely testing setup would be:

- **Unit Tests**: Vitest (Vite-native test runner)
- **Component Tests**: React Testing Library
- **Integration Tests**: Playwright or Cypress
- **Rust Tests**: Built-in `cargo test`

#### Recommended Test Structure

```
src/
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx      # Co-located component tests
├── services/
│   ├── api.ts
│   └── api.test.ts              # Service layer tests
├── store/
│   ├── userStore.ts
│   └── userStore.test.ts        # State management tests
```

#### Testing Priorities (When Implemented)

1. **Critical Path**:

   - RFID scan processing (`useRfidScanning.ts`)
   - API authentication (`api.ts` PIN validation)
   - Store actions (`userStore.ts`)

2. **UI Components**:

   - Modal behavior
   - Form validation
   - Error states

3. **Integration**:
   - End-to-end auth flow
   - RFID scan → API → UI update
   - Offline queue → sync

---

## 5. Build & Development

### Package Manager

**Tool**: npm (using package-lock.json v3)
**Version**: Specified in package-lock.json (check with `npm --version`)

### Build Tools

#### Vite 6.0.3

**Configuration** (`vite.config.ts`):

```typescript
{
  plugins: [react()],

  // Tauri-specific settings
  clearScreen: false,              // Don't clear terminal (shows Rust errors)

  server: {
    port: 1420,                    // Fixed port (Tauri expects this)
    strictPort: true,              // Fail if port unavailable
    host: false,                   // Localhost only (or from TAURI_DEV_HOST)
    hmr: {
      protocol: 'ws',
      port: 1421
    },
    watch: {
      ignored: ['**/src-tauri/**'] // Don't watch Rust files
    }
  }
}
```

#### Tauri CLI

**Version**: `@tauri-apps/cli` v2

**Key Commands**:

- `tauri dev` → Starts Rust backend + Vite frontend
- `tauri build` → Creates production installers
- `tauri info` → Shows environment details

### Development Workflow

#### Starting Development

**Option 1: Full App (Tauri + Frontend)**

```bash
npm run tauri dev
```

- Starts Rust backend (Tauri)
- Starts Vite dev server (port 1420)
- Opens application window
- Hot reload enabled for frontend
- Cargo watch for Rust changes

**Option 2: Frontend Only (Faster UI Development)**

```bash
npm run dev
```

- Starts Vite dev server only
- No Tauri backend (API calls will fail unless backend is running separately)
- Faster startup
- Good for UI tweaking

#### Available npm Scripts

| Script         | Command                                               | Purpose                       |
| -------------- | ----------------------------------------------------- | ----------------------------- |
| `dev`          | `vite`                                                | Frontend-only dev server      |
| `build`        | `tsc && vite build`                                   | Type check + production build |
| `preview`      | `vite preview`                                        | Preview production build      |
| `tauri`        | `tauri`                                               | Tauri CLI wrapper             |
| `lint`         | `eslint src --ext .ts,.tsx`                           | Run ESLint                    |
| `lint:fix`     | `eslint src --ext .ts,.tsx --fix`                     | Auto-fix ESLint issues        |
| `typecheck`    | `tsc --noEmit`                                        | Type check without emitting   |
| `check`        | `eslint src --ext .ts,.tsx && tsc --noEmit`           | Lint + type check             |
| `format`       | `prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"` | Format all files              |
| `format:check` | `prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"` | Check formatting              |
| `clean:target` | `cd src-tauri && cargo clean`                         | Clean Rust build artifacts    |

#### Rust Development Commands

**In `src-tauri/` directory:**

| Command                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `cargo check`               | Fast syntax/type checking (no codegen) |
| `cargo clippy`              | Rust linter (strict warnings)          |
| `cargo fmt`                 | Format Rust code                       |
| `cargo test`                | Run all Rust tests                     |
| `cargo build --release`     | Production Rust build                  |
| `./test_rfid.sh`            | Test RFID hardware (single scan)       |
| `./test_rfid_persistent.sh` | Test RFID hardware (continuous)        |

### Environment Setup

#### Required Environment Variables

**File**: `.env` (copy from `.env.example`)

```bash
# Runtime configuration (read by Rust at startup)
API_BASE_URL=http://localhost:8080
DEVICE_API_KEY=your_device_api_key_here

# Window configuration
TAURI_FULLSCREEN=false             # true for kiosk mode

# Development configuration (baked into frontend bundle at build time)
VITE_ENABLE_RFID=false             # true for real hardware
VITE_MOCK_RFID_TAGS=04:D6:94:82:97:6A:80,04:A7:B3:C2:D1:E0:F5
```

**Key Distinctions:**

- `API_BASE_URL` / `DEVICE_API_KEY`: Read at **runtime** by Rust
- `VITE_*` variables: Baked into **build** (frontend only)

#### System Prerequisites

**Development Machine:**

- Node.js 18+ (for npm)
- Rust 1.70+ (for Tauri)
- Platform-specific Tauri dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`
  - **Windows**: Visual Studio 2019+ with C++ tools

**Raspberry Pi (Production):**

- Raspberry Pi OS 64-bit (Bookworm recommended)
- Rust cross-compilation or native build (see `docs/pi5-native-build.md`)
- RFID reader hardware (MFRC522 connected via SPI)

### Hot Reload / Watch Mode

**Frontend (Vite HMR):**

- ✅ Automatic: Saving `.tsx`/`.ts` files triggers instant reload
- ✅ Preserves React state in most cases
- ❌ Full reload on: route changes, store changes

**Backend (Tauri)**:

- ⚠️ **Partial**: Rust changes require manual restart (`Ctrl+C` → `npm run tauri dev`)
- No cargo-watch integration by default

**Tip**: Use `npm run dev` for frontend-only work to avoid Rust rebuilds.

---

## 6. Dependencies & Integrations

### Critical Dependencies

#### Frontend (package.json)

**Core Framework:**

```json
"react": "^18.3.1",
"react-dom": "^18.3.1",
"react-router-dom": "^7.6.0"
```

**State Management:**

```json
"zustand": "^5.0.4"
```

- **Why**: Lightweight, TypeScript-friendly state management
- **Alternative considered**: Redux (too heavy), Context API (too verbose)

**Desktop Runtime:**

```json
"@tauri-apps/api": "^2.5.0",
"@tauri-apps/plugin-opener": "^2"
```

- **Why**: Provides Rust ↔ TypeScript IPC bridge

**Styling:**

```json
"@fortawesome/fontawesome-svg-core": "^6.7.2",
"@fortawesome/free-solid-svg-icons": "^6.7.2",
"@fortawesome/react-fontawesome": "^0.2.2"
```

- **Why**: Icon library for UI consistency

**Dev Tools:**

```json
"vite": "^6.0.3",
"@vitejs/plugin-react": "^4.3.4",
"typescript": "~5.6.2",
"eslint": "^9.26.0",
"prettier": "^3.5.3",
"tailwindcss": "^4.1.6"
```

#### Backend (Cargo.toml)

**Core Framework:**

```toml
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
```

**Serialization:**

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Utilities:**

```toml
chrono = { version = "0.4", features = ["serde"] }  # Date/time handling
tokio = { version = "1", features = ["time", "rt", "rt-multi-thread", "sync"] }  # Async runtime
rand = "0.8"                                         # Random number generation
dotenvy = "0.15"                                     # .env file loading
```

**Platform-Specific (ARM/ARM64 Linux only):**

```toml
[target.'cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))'.dependencies]
mfrc522 = { version = "0.8.0", features = ["eh02"] }  # RFID reader driver
rppal = "0.14.1"                                      # Raspberry Pi GPIO
embedded-hal = "0.2.7"                                # Hardware abstraction
linux-embedded-hal = "0.3.2"                          # Linux HAL implementation
```

### Internal Package Dependencies

**Pattern**: Monolithic structure (not a monorepo)

- All code in single package
- No internal package dependencies
- Shared types via TypeScript modules

### External APIs and Services

#### Project Phoenix Backend

**Base URL**: Configured via `API_BASE_URL` env variable
**Default**: `http://localhost:8080`

**Authentication**:

- Device API key (Bearer token): `DEVICE_API_KEY`
- Staff PIN (custom header): `X-Staff-PIN`

**Key Endpoints** (from `src/services/api.ts`):

| Method | Endpoint                    | Purpose                                   | Auth Required                   |
| ------ | --------------------------- | ----------------------------------------- | ------------------------------- |
| GET    | `/api/iot/teachers`         | Fetch teacher list                        | Device API key                  |
| POST   | `/api/iot/ping`             | Validate global PIN                       | Device API key + PIN            |
| GET    | `/api/iot/status`           | Validate teacher PIN                      | Device API key + PIN + Staff ID |
| GET    | `/api/iot/activities`       | Get teacher's activities                  | Device API key + PIN            |
| GET    | `/api/iot/rooms/available`  | Get available rooms                       | Device API key + PIN            |
| POST   | `/api/iot/session/start`    | Start activity session                    | Device API key + PIN            |
| GET    | `/api/iot/session/current`  | Get current session                       | Device API key + PIN            |
| POST   | `/api/iot/session/end`      | End session                               | Device API key + PIN            |
| POST   | `/api/iot/checkin`          | Process RFID check-in/out                 | Device API key + PIN            |
| POST   | `/api/iot/session/activity` | Update session activity (prevent timeout) | Device API key + PIN            |
| GET    | `/api/iot/students`         | Get students for teachers                 | Device API key + PIN            |
| GET    | `/api/iot/rfid/{tagId}`     | Check tag assignment                      | Device API key + PIN            |
| POST   | `/api/students/{id}/rfid`   | Assign RFID tag                           | Device API key + PIN            |

**Error Handling**:

- 401: Invalid PIN
- 403: Forbidden (no permission)
- 404: Resource not found
- 423: Account locked (too many failed attempts)

### Authentication/Authorization Approach

**Two-Level Authentication:**

1. **Device Level** (all requests):

   ```typescript
   headers: {
     'Authorization': `Bearer ${DEVICE_API_KEY}`
   }
   ```

2. **Staff Level** (most requests):
   ```typescript
   headers: {
     'X-Staff-PIN': pin,
     'X-Staff-ID': staffId.toString()  // Optional, for specific endpoints
   }
   ```

**PIN Storage**:

- Stored in Zustand store: `authenticatedUser.pin`
- Used for all authenticated API calls
- Not persisted (cleared on logout)

**Security Features**:

- Rate limiting on PIN validation (backend)
- Account lockout after failed attempts (backend)
- No PIN transmitted in URL/query params (always in headers)

### Database(s) Used

**PyrePortal Side**: None (all data from API)

**Backend Side** (Project Phoenix):

- PostgreSQL database
- Accessed via backend API only
- Schema owned by backend

**Local Storage** (Tauri File System):

- Session settings: JSON file in app data directory
- Student cache: JSON file in app data directory
- Logs: Text files in logs directory

---

## 7. Common Workflows

### Adding a New Feature (Step by Step)

**Example**: Adding a "Student Photo Display" feature

1. **Define Types** (`src/services/api.ts`)

   ```typescript
   export interface StudentPhoto {
     student_id: number;
     photo_url: string;
     uploaded_at: string;
   }
   ```

2. **Add API Method** (`src/services/api.ts`)

   ```typescript
   async getStudentPhoto(pin: string, studentId: number): Promise<StudentPhoto> {
     const response = await apiCall<{status: string; data: StudentPhoto}>(
       `/api/students/${studentId}/photo`,
       { headers: { Authorization: `Bearer ${DEVICE_API_KEY}`, 'X-Staff-PIN': pin } }
     );
     return response.data;
   }
   ```

3. **Add Store Action** (`src/store/userStore.ts`)

   ```typescript
   interface UserState {
     // ... existing state
     studentPhotos: Map<number, StudentPhoto>;

     // ... existing actions
     fetchStudentPhoto: (studentId: number) => Promise<void>;
   }

   const createUserStore = (set, get) => ({
     // ... existing implementation
     studentPhotos: new Map(),

     fetchStudentPhoto: async (studentId: number) => {
       const { authenticatedUser } = get();
       if (!authenticatedUser?.pin) return;

       try {
         const photo = await api.getStudentPhoto(authenticatedUser.pin, studentId);
         set(state => ({
           studentPhotos: new Map(state.studentPhotos).set(studentId, photo),
         }));
       } catch (error) {
         logger.error('Failed to fetch student photo', { error, studentId });
       }
     },
   });
   ```

4. **Create UI Component** (`src/components/StudentPhoto.tsx`)

   ```typescript
   import { useEffect } from 'react';
   import { useUserStore } from '../store/userStore';

   export const StudentPhoto = ({ studentId }: { studentId: number }) => {
     const { studentPhotos, fetchStudentPhoto } = useUserStore();
     const photo = studentPhotos.get(studentId);

     useEffect(() => {
       if (!photo) {
         void fetchStudentPhoto(studentId);
       }
     }, [studentId, photo, fetchStudentPhoto]);

     if (!photo) return <div>Loading...</div>;

     return <img src={photo.photo_url} alt="Student" />;
   };
   ```

5. **Add to Page** (`src/pages/ActivityScanningPage.tsx`)

   ```typescript
   import { StudentPhoto } from '../components/StudentPhoto';

   // ... in render:
   {currentScan && (
     <StudentPhoto studentId={currentScan.student_id} />
   )}
   ```

6. **Add Logging**

   ```typescript
   storeLogger.info('Student photo fetched', { studentId, photoUrl: photo.photo_url });
   ```

7. **Run Checks**
   ```bash
   npm run check        # ESLint + TypeScript
   npm run format       # Prettier
   ```

### Fixing a Bug (Process)

1. **Reproduce** the issue
2. **Check logs**:
   - Browser console (frontend errors)
   - Application logs (Rust backend):
     - macOS: `~/Library/Logs/pyreportal`
     - Linux: `~/.config/pyreportal/logs`
3. **Add debug logging** if needed:
   ```typescript
   logger.debug('Investigating issue X', { relevantData });
   ```
4. **Fix code**
5. **Verify fix** manually
6. **Add test** (when testing is set up)
7. **Commit** with clear message:
   ```bash
   git commit -m "fix: resolve RFID duplicate scan issue in cache-first flow"
   ```

### Running Tests

**Status**: ⚠️ No tests currently implemented

**Planned Commands**:

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Coverage report
```

**Rust Tests**:

```bash
cd src-tauri
cargo test            # Run Rust unit tests
```

### Creating a Build

#### Development Build

```bash
npm run tauri dev
```

- No optimization
- Debug symbols included
- Console logging active

#### Production Build

```bash
npm run tauri build
```

**Process:**

1. Runs `npm run build` (TypeScript check + Vite build)
2. Compiles Rust in release mode (`--release`)
3. Bundles frontend assets
4. Creates platform-specific installer:
   - **macOS**: `.dmg` and `.app` in `src-tauri/target/release/bundle/`
   - **Linux**: `.deb`, `.AppImage` in `src-tauri/target/release/bundle/`
   - **Windows**: `.msi`, `.exe` in `src-tauri/target/release/bundle/`

**Build Artifacts**:

- Frontend: `dist/` (HTML, JS, CSS)
- Rust binary: `src-tauri/target/release/pyreportal`
- Installers: `src-tauri/target/release/bundle/<type>/`

### Git Workflow

#### Branching Strategy

**Pattern**: Git Flow (implied from commit history)

- `main`: Production-ready code
- `development`: Integration branch (current active branch)
- Feature branches: Not visible in current history

#### Commit Conventions

**Format** (not strict, but common pattern):

```
type: description

[optional body]
```

**Types observed**:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code restructuring
- `perf:` Performance improvement

**Recent Examples**:

```
feat: cache-first RFID scanning
feat: replace text with transparent arrow image on scanning page
docs: add verified working kiosk setup documentation
```

#### Pull Request Process

**Status**: Not visible in repository (may be using direct commits or external PR system)

### Deployment Process

#### Raspberry Pi Kiosk Deployment

1. **Build on Development Machine**:

   ```bash
   # Option 1: Cross-compile (faster, more complex)
   # See CLAUDE.md for cross-compilation setup

   # Option 2: Native build on Pi (slower, reliable)
   # See docs/pi5-native-build.md
   ```

2. **Transfer Binary** (if cross-compiled):

   ```bash
   scp src-tauri/target/aarch64-unknown-linux-gnu/release/pyreportal pi@<ip>:/home/pi/
   ```

3. **Setup Environment** on Pi:

   ```bash
   cd /home/pi/pyreportal
   cp .env.example .env
   nano .env  # Configure API_BASE_URL, DEVICE_API_KEY, TAURI_FULLSCREEN=true
   ```

4. **Run Application**:

   ```bash
   DISPLAY=:0 ./pyreportal
   ```

5. **Auto-start on Boot** (optional):
   - Create systemd service or desktop autostart entry
   - Ensure kiosk mode is enabled (`TAURI_FULLSCREEN=true`)

**Performance Notes** (from `docs/pi5-native-build.md`):

- **Cross-compiled 32-bit**: 15-25 FPS
- **Pi 4 Native 64-bit**: 30-45 FPS
- **Pi 5 Native 64-bit**: 45-60 FPS (recommended)

---

## 8. Error Handling

### Error Handling Patterns in Codebase

#### API Layer (`src/services/api.ts`)

**Pattern**: Throw errors with descriptive messages

```typescript
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} - ${response.statusText}`;
    try {
      const errorData = (await response.json()) as { message?: string; error?: string };
      if (errorData.message) {
        errorMessage = `${errorMessage}: ${errorData.message}`;
      }
    } catch {
      // JSON parsing failed, use default message
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}
```

**Characteristics**:

- Status code included in error message
- Server error details extracted from JSON
- All errors thrown as `Error` instances
- Caught by calling code (store actions)

#### Store Layer (`src/store/userStore.ts`)

**Pattern**: Try-catch with logging + user-facing error state

```typescript
fetchTeachers: async () => {
  set({ isLoading: true, error: null });
  try {
    storeLogger.info('Fetching teachers from API');
    const teachers = await api.getTeachers();
    set({ users: teachers.map(teacherToUser), isLoading: false });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    storeLogger.error('Failed to fetch teachers', { error: errorMessage });
    set({
      error: 'Fehler beim Laden der Lehrer. Bitte versuchen Sie es erneut.',
      isLoading: false,
    });
    throw error; // Re-throw for component-level handling
  }
};
```

**Characteristics**:

- Logs error with context
- Sets user-friendly German error message in store
- Re-throws error for optional UI-level handling
- Always clears loading state

#### Component Layer (React)

**Pattern**: Error boundaries + conditional rendering

```typescript
// Root-level error boundary (src/utils/errorBoundary.tsx)
class ErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('React Error Boundary caught error', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh.</div>;
    }
    return this.props.children;
  }
}
```

**Store Error Display**:

```typescript
const { error } = useUserStore();

{error && (
  <ErrorModal
    isOpen={!!error}
    onClose={() => setError(null)}
    message={error}
  />
)}
```

#### RFID Scanning (`src/hooks/useRfidScanning.ts`)

**Pattern**: Graceful degradation with offline queue

```typescript
try {
  const result = await api.processRfidScan(scanData, pin);
  setScanResult(result);
} catch (error) {
  logger.error('Failed to process RFID scan', { error });

  // Queue for retry
  const operationId = queueFailedScan(tagId, 'checkin', roomId, pin);
  logger.info('Scan queued for background sync', { operationId });

  // Show user-friendly error
  const errorResult: RfidScanResult = {
    student_name: 'Scan Failed',
    action: 'error',
    message: 'Will retry when online',
  };
  setScanResult(errorResult);
}
```

**Characteristics**:

- Logs error
- Queues failed operation
- Shows user feedback
- Continues operation (doesn't crash)

### Logging Approach and Tools

#### Three-Layer Logging System

1. **Frontend Logger** (`src/utils/logger.ts`)

   - **Purpose**: Browser-side logging with levels
   - **Output**: Console + in-memory buffer
   - **Persistence**: Sends to Rust backend via IPC

   **Usage**:

   ```typescript
   import { createLogger } from '../utils/logger';
   const logger = createLogger('ComponentName');

   logger.debug('Debug message', { data });
   logger.info('Info message', { data });
   logger.warn('Warning message', { data });
   logger.error('Error message', { error });
   ```

   **Levels** (enum):

   ```typescript
   enum LogLevel {
     DEBUG = 0, // Verbose diagnostic info
     INFO = 1, // General info (API calls, state changes)
     WARN = 2, // Warnings (recoverable issues)
     ERROR = 3, // Errors (failures)
     NONE = 4, // Disable logging
   }
   ```

   **Configuration**:

   - Development: `DEBUG` level, console output
   - Production: `WARN` level, persistence enabled

2. **Store Logger** (`src/utils/storeLogger.ts` + `storeMiddleware.ts`)

   - **Purpose**: Zustand store action tracking
   - **Output**: Console + frontend logger

   **Usage** (automatic via middleware):

   ```typescript
   export const useUserStore = create<UserState>(
     loggerMiddleware(createUserStore, {
       name: 'UserStore',
       logLevel: LogLevel.DEBUG,
       activityTracking: true,
       stateChanges: true,
       actionSource: true,
       excludedActions: ['functionalUpdate'],
     })
   );
   ```

   **Logged Events**:

   - Action calls (function name + arguments)
   - State changes (before/after snapshots)
   - Action source (which component triggered)

3. **Rust Backend Logger** (`src-tauri/src/logging.rs`)

   - **Purpose**: Persistent file-based logging
   - **Output**: Log files with rotation

   **Log Locations**:

   - **macOS**: `~/Library/Logs/pyreportal/app_YYYYMMDD_HHMMSS.log`
   - **Linux**: `~/.config/pyreportal/logs/app_YYYYMMDD_HHMMSS.log`
   - **Windows**: `%APPDATA%\pyreportal\logs\app_YYYYMMDD_HHMMSS.log`

   **Commands**:

   ```rust
   #[tauri::command]
   fn write_log(entry: String) -> Result<(), String>

   #[tauri::command]
   fn get_log_files() -> Result<Vec<String>, String>

   #[tauri::command]
   fn cleanup_old_logs(max_age_days: u64) -> Result<(), String>
   ```

#### Log Format

**Frontend/Store Logs**:

```
[2025-10-02T14:32:15.123Z] [ComponentName] Message here
```

**Rust Logs**:

```json
{
  "timestamp": "2025-10-02T14:32:15.123Z",
  "level": "INFO",
  "source": "ComponentName",
  "message": "Message here",
  "data": { "key": "value" }
}
```

### Monitoring/Observability Setup

**Current Status**: Local logging only (no cloud monitoring)

**Available Tools**:

- In-app log viewer (`src/utils/logViewer.tsx`)
- File-based logs on device
- Browser DevTools console

**Planned** (not implemented):

- Error aggregation service (e.g., Sentry)
- Usage analytics
- Performance monitoring

---

## 9. Project-Specific Quirks

### Non-Obvious Architectural Decisions

#### 1. Cache-First RFID Scanning

**Decision**: Check local student cache before API call

**Rationale**:

- Network latency on Raspberry Pi: 200-500ms
- Cache hit provides <10ms response time
- Better UX for repeat scans (same students during session)

**Implementation** (`src/hooks/useRfidScanning.ts:118-215`):

```typescript
// 1. Check cache first
const cachedStudent = getCachedStudentData(tagId);
if (cachedStudent) {
  // Show instant UI with predicted action
  setScanResult(cachedResult);
  showScanModal();

  // Background sync with server (don't block UI)
  void (async () => {
    const syncResult = await api.processRfidScan(...);
    // Silently update cache
  })();
}
```

**Trade-offs**:

- Pro: Instant feedback
- Con: Potential cache staleness (mitigated by background sync)

#### 2. Zustand with Logging Middleware

**Decision**: Single Zustand store with custom logging middleware instead of Redux

**Rationale**:

- Zustand: 95% less boilerplate than Redux
- Custom middleware: Full visibility into state changes
- TypeScript-friendly: No need for action creators

**Implementation**:

```typescript
export const useUserStore = create<UserState>(
  loggerMiddleware(createUserStore, { ... })
);
```

**Logging Output**:

```
[UserStore] Action: fetchTeachers
[UserStore] State changed: users (0 → 15 items)
```

#### 3. Tauri IPC for Configuration

**Decision**: Load API credentials from Rust backend, not frontend .env

**Rationale**:

- Frontend .env is baked into build (insecure for API keys)
- Rust can read `.env` at runtime (allows changing keys without rebuild)
- Device-specific configuration (different keys per Pi)

**Implementation** (`src-tauri/src/lib.rs:17-32`):

```rust
#[tauri::command]
fn get_api_config() -> Result<ApiConfig, String> {
    let api_base_url = env::var("API_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());

    let device_api_key = env::var("DEVICE_API_KEY")
        .map_err(|_| "API key not found")?;

    Ok(ApiConfig { api_base_url, device_api_key })
}
```

**Usage** (`src/services/api.ts:25-54`):

```typescript
const config = await safeInvoke<ApiConfig>('get_api_config');
API_BASE_URL = config.api_base_url;
DEVICE_API_KEY = config.device_api_key;
```

#### 4. Multi-Layer Duplicate Scan Prevention

**Decision**: Three separate mechanisms to prevent duplicate RFID scans

**Rationale**:

- RFID readers can emit multiple events for single scan (hardware quirk)
- Users may accidentally scan twice
- Network latency creates race conditions

**Layers** (`src/store/userStore.ts:1117-1201`):

1. **Processing Queue**: Blocks tag if currently being processed
2. **Recent Tag Scans**: Blocks tag if scanned within 2 seconds
3. **Student History**: Blocks opposite action if student just performed action

**Code**:

```typescript
canProcessTag: (tagId: string) => {
  if (rfid.processingQueue.has(tagId)) return false;

  const recentScan = rfid.recentTagScans.get(tagId);
  if (recentScan && Date.now() - recentScan.timestamp < 2000) return false;

  const studentId = rfid.tagToStudentMap.get(tagId);
  if (studentId) {
    return get().isValidStudentScan(studentId, 'checkin');
  }

  return true;
};
```

### Known Issues or Workarounds

#### 1. RFID Hardware Initialization Delay

**Issue**: RFID reader takes 2-3 seconds to initialize on Raspberry Pi

**Workaround**: Pre-initialize service on app startup

```typescript
// src/components/RfidServiceInitializer.tsx
useEffect(() => {
  void safeInvoke('initialize_rfid_service');
}, []);
```

**Impact**: First scan may fail if too quick after app launch

#### 2. Tauri IPC Error Handling

**Issue**: Tauri IPC errors don't provide detailed stack traces

**Workaround**: Extensive logging in Rust commands

```rust
#[tauri::command]
fn some_command() -> Result<T, String> {
    let result = do_something().map_err(|e| {
        eprintln!("Error in some_command: {:?}", e);  // Log to stderr
        format!("Command failed: {}", e)               // User-facing message
    })?;
    Ok(result)
}
```

**Status**: Acceptable for current use case

#### 3. Session Timeout Prevention

**Issue**: Backend closes sessions after 30 minutes of inactivity

**Workaround**: Send keepalive on every RFID scan

```typescript
// src/hooks/useRfidScanning.ts:290-296
try {
  await api.updateSessionActivity(authenticatedUser.pin);
  logger.debug('Session activity updated');
} catch (error) {
  logger.warn('Failed to update session activity', { error });
}
```

**Trade-off**: Extra API call per scan (negligible overhead)

### Performance Considerations

#### 1. Raspberry Pi Performance

**Issue**: Limited CPU/GPU compared to desktop

**Optimizations**:

- Minimize React re-renders (use `React.memo`, avoid inline functions)
- Lazy load non-critical images
- Use CSS transforms for animations (GPU-accelerated)

**Measured Performance**:

- 32-bit build: 15-25 FPS
- Pi 4 64-bit build: 30-45 FPS
- Pi 5 64-bit build: 45-60 FPS (recommended)

**Source**: `docs/performance-testing.md`

#### 2. Store Update Batching

**Pattern**: Batch multiple state updates to prevent cascading re-renders

```typescript
// ❌ BAD: 3 separate renders
set({ isLoading: true });
set({ error: null });
set({ data: result });

// ✅ GOOD: 1 render
set({
  isLoading: true,
  error: null,
  data: result,
});
```

#### 3. API Call Deduplication

**Pattern**: Prevent duplicate fetches with closure-based locking

**Example** (`src/store/userStore.ts:721-793`):

```typescript
fetchActivities: (() => {
  let fetchPromise: Promise<ActivityResponse[] | null> | null = null;

  return async (): Promise<ActivityResponse[] | null> => {
    // Return existing promise if already fetching
    if (fetchPromise) {
      logger.debug('Activities fetch already in progress, returning existing promise');
      return fetchPromise;
    }

    fetchPromise = (async () => {
      try {
        const activitiesData = await api.getActivities(pin);
        return activitiesData;
      } finally {
        fetchPromise = null; // Clear when done
      }
    })();

    return fetchPromise;
  };
})();
```

**Benefit**: Multiple rapid calls share single fetch

### Security Requirements

#### 1. PIN Transmission

**Rule**: Never send PINs in URL/query parameters

**Implementation**:

```typescript
// ✅ CORRECT
headers: { 'X-Staff-PIN': pin }

// ❌ NEVER
fetch(`/api/validate?pin=${pin}`)  // Logged in server access logs
```

#### 2. API Key Storage

**Rule**: Never commit API keys to git

**Implementation**:

- `.env` file in `.gitignore`
- `.env.example` template with fake values
- Runtime loading from environment

#### 3. Input Validation

**Rule**: Validate all user inputs (even from trusted API)

**Example** (`eslint.config.js:136`):

```javascript
// ESLint rule for file system operations
'security/detect-non-literal-fs-filename': 'error'
```

**Rust Side**:

```rust
// Path traversal prevention
fn sanitize_path(path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path).canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // Ensure path is within app directory
    if !canonical.starts_with(&app_dir) {
        return Err("Path outside app directory".to_string());
    }
    Ok(canonical)
}
```

### Areas That Need Special Attention When Modifying

#### 1. RFID Scanning Logic (`src/hooks/useRfidScanning.ts`)

**Why**: Complex state machine with race conditions

**Checklist when modifying**:

- [ ] Test with rapid successive scans (< 1 second apart)
- [ ] Test with same tag scanned multiple times
- [ ] Test offline → online transition
- [ ] Verify cache invalidation timing
- [ ] Check for memory leaks in event listeners

**Critical Section**:

```typescript
// Lines 82-373: processScan function
// Multi-layer duplicate prevention + cache logic
```

#### 2. Store Actions (`src/store/userStore.ts`)

**Why**: Single source of truth for app state

**Checklist when modifying**:

- [ ] Add logging to new actions
- [ ] Update TypeScript types
- [ ] Batch state updates (avoid multiple `set()` calls)
- [ ] Handle loading/error states
- [ ] Consider offline scenarios

**Critical Sections**:

- Lines 354-386: `fetchTeachers` (template for API calls)
- Lines 1433-1523: `validateAndRecreateSession` (complex validation)

#### 3. API Service (`src/services/api.ts`)

**Why**: All backend communication flows through here

**Checklist when modifying**:

- [ ] Update TypeScript interfaces for request/response
- [ ] Add error handling for new status codes
- [ ] Log important calls (PIN validation, scans)
- [ ] Update network quality tracking if adding critical endpoint

**Pattern to Follow**:

```typescript
async getSomething(pin: string): Promise<SomeType> {
  const response = await apiCall<{status: string; data: SomeType}>(
    '/api/endpoint',
    {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      }
    }
  );
  return response.data;
}
```

#### 4. Tauri Commands (`src-tauri/src/lib.rs`)

**Why**: Bridge between frontend and system resources

**Checklist when adding command**:

- [ ] Add `#[tauri::command]` annotation
- [ ] Register in `invoke_handler![]` macro
- [ ] Return `Result<T, String>` for error handling
- [ ] Add logging (use `eprintln!` for debugging)
- [ ] Handle errors gracefully (don't panic)

**Template**:

```rust
#[tauri::command]
fn do_something(param: String) -> Result<ReturnType, String> {
    // Implementation
    do_work(param)
        .map_err(|e| format!("Failed to do something: {}", e))
}

// In lib.rs setup:
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    do_something
])
```

---

## 10. File Inventory

### Configuration Files

| File                          | Purpose                         | Key Settings                                            |
| ----------------------------- | ------------------------------- | ------------------------------------------------------- |
| **package.json**              | Node dependencies + npm scripts | `"type": "module"`, React 18.3.1, Zustand 5.0.4         |
| **tsconfig.json**             | TypeScript compiler config      | `strict: true`, `target: ES2020`, `jsx: "react-jsx"`    |
| **tsconfig.node.json**        | TypeScript for build scripts    | `moduleResolution: "bundler"`                           |
| **vite.config.ts**            | Vite build tool config          | Port 1420, HMR on 1421, ignore src-tauri                |
| **eslint.config.js**          | ESLint linting rules            | Flat config, TypeScript + React plugins, security rules |
| **prettier.config.js**        | Code formatting                 | `printWidth: 100`, `singleQuote: true`, Tailwind plugin |
| **tailwind.config.js**        | Tailwind CSS theme              | Custom colors (primary: #24c8db), custom shadows        |
| **postcss.config.js**         | PostCSS config                  | Tailwind + Autoprefixer                                 |
| **.env.example**              | Environment template            | API_BASE_URL, DEVICE_API_KEY, RFID settings             |
| **.gitignore**                | Git ignore patterns             | node_modules, dist, target, .env                        |
| **src-tauri/Cargo.toml**      | Rust dependencies               | Tauri 2, Serde, Tokio, RFID libs (ARM only)             |
| **src-tauri/tauri.conf.json** | Tauri app config                | App name, window settings, bundle config                |
| **.cargo/config.toml**        | Cargo build config              | Cross-compilation targets (ARM)                         |

### Key Source Directories

#### src/ (Frontend)

| Directory          | Contents                      | Purpose                                  |
| ------------------ | ----------------------------- | ---------------------------------------- |
| **assets/**        | `react.svg`                   | Static assets (minimal, most in public/) |
| **components/**    | React components              | Feature-specific components              |
| **components/ui/** | 13 UI components              | Reusable buttons, modals, inputs         |
| **hooks/**         | 2 custom hooks                | `useRfidScanning`, `useNetworkStatus`    |
| **pages/**         | 12 page components            | Route-level components                   |
| **services/**      | 4 service files               | API, storage, cache, sync queue          |
| **store/**         | `userStore.ts`                | Zustand state management                 |
| **styles/**        | `designSystem.ts`, `theme.ts` | Design tokens, theme config              |
| **utils/**         | 7 utility files               | Logger, error boundary, Tauri helpers    |

#### src-tauri/src/ (Backend)

| File                            | Lines | Purpose                          |
| ------------------------------- | ----- | -------------------------------- |
| **lib.rs**                      | 98    | Main entry, command registration |
| **main.rs**                     | ~10   | Binary entry point (minimal)     |
| **logging.rs**                  | ~200  | File-based logging with rotation |
| **rfid.rs**                     | ~400  | RFID hardware abstraction + mock |
| **session_storage.rs**          | ~150  | Session settings persistence     |
| **student_cache.rs**            | ~200  | Student data caching             |
| **bin/rfid_test.rs**            | ~100  | RFID hardware test utility       |
| **bin/rfid_test_persistent.rs** | ~150  | Continuous RFID test             |

### Generated/Build Directories to Ignore

| Directory             | Generated By  | Purpose                   | Git Status |
| --------------------- | ------------- | ------------------------- | ---------- |
| **node_modules/**     | npm install   | Node dependencies         | Ignored    |
| **dist/**             | npm run build | Frontend production build | Ignored    |
| **src-tauri/target/** | cargo build   | Rust compilation output   | Ignored    |
| **src-tauri/gen/**    | Tauri CLI     | Generated Tauri schemas   | Committed  |

### Files Containing or Potentially Containing Sensitive Data

| File                          | Sensitivity | Reason                                             | Git Status  |
| ----------------------------- | ----------- | -------------------------------------------------- | ----------- |
| **.env**                      | 🔴 **HIGH** | Contains DEVICE_API_KEY (production secret)        | **IGNORED** |
| **.env.example**              | ✅ Safe     | Template with fake values                          | Committed   |
| **src/services/api.ts**       | ⚠️ Low      | API_BASE_URL hardcoded fallback (not secret)       | Committed   |
| **CLAUDE.local.md**           | 🟡 Medium   | Private development notes                          | **IGNORED** |
| **package-lock.json**         | ✅ Safe     | Dependency lock (no secrets)                       | Committed   |
| **Cargo.lock**                | ✅ Safe     | Dependency lock (no secrets)                       | Committed   |
| **rfid-dev.log**              | 🟡 Medium   | May contain scanned RFID tags (PII)                | **IGNORED** |
| **src-tauri/target/release/** | 🟡 Medium   | Compiled binaries (may leak .env if built with it) | **IGNORED** |

**Security Notes**:

- Never commit `.env` files
- API keys should be changed if accidentally committed (revoke + regenerate)
- RFID tag IDs are considered PII (don't commit in logs)
- Log files may contain student names (handle per GDPR)

---

## Appendix: Quick Command Reference

### Daily Development

```bash
# Start development
npm run tauri dev          # Full app (Rust + Frontend)
npm run dev                # Frontend only (faster)

# Code quality
npm run check              # ESLint + TypeScript
npm run format             # Auto-format with Prettier
npm run lint:fix           # Auto-fix ESLint issues

# Rust checks
cd src-tauri
cargo clippy               # Rust linter
cargo fmt                  # Format Rust code
```

### Production Build

```bash
# Full production build
npm run tauri build

# Outputs:
# - macOS: src-tauri/target/release/bundle/dmg/
# - Linux: src-tauri/target/release/bundle/deb/ or appimage/
# - Windows: src-tauri/target/release/bundle/msi/
```

### Debugging

```bash
# View logs
# macOS:
tail -f ~/Library/Logs/pyreportal/app_*.log

# Linux:
tail -f ~/.config/pyreportal/logs/app_*.log

# Test RFID hardware (Raspberry Pi only)
cd src-tauri
./test_rfid.sh             # Single scan test
./test_rfid_persistent.sh  # Continuous scanning
```

### Clean Build

```bash
# Clean everything
rm -rf node_modules dist
npm run clean:target       # Clean Rust artifacts

# Reinstall
npm install

# Rebuild
npm run tauri build
```

---

**Document End**

_Last Updated: 2025-10-02_
_Maintainer: Development Team_
_For questions or corrections, update this document via git commit_
