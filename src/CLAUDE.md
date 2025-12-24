# Frontend Architecture Context

This directory contains the React/TypeScript frontend for PyrePortal.

## Directory Structure

- **components/** - React components (UI primitives + feature-specific)
- **hooks/** - Custom React hooks (RFID scanning, network status)
- **pages/** - Route-level components (full screen views)
- **services/** - Business logic layer (API, storage, sync queue)
- **store/** - Zustand state management (single store pattern)
- **styles/** - Design system and theme configuration
- **utils/** - Pure utility functions (logger, error boundary)

## Key Patterns

### State Management (Zustand)

- **Single store**: All app state in `store/userStore.ts`
- **Logging middleware**: Automatic action tracking via `utils/storeMiddleware.ts`
- **Batch updates**: Always batch multiple `set()` calls (see `store/CLAUDE.md` for examples)

### Component Patterns

- **UI primitives**: In `components/ui/` (reusable buttons, modals, inputs)
- **Feature components**: In `components/` root (RFID initializer, session toggle)
- **Page components**: In `pages/` (route-level, full screens)

### Import Order (ESLint enforced)

```typescript
// 1. External dependencies
import { useEffect, useState } from 'react';
import { create } from 'zustand';

// 2. Internal services/store
import { api, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';

// 3. Internal utilities
import { createLogger } from '../utils/logger';
```

### Type Import Style

```typescript
// ✅ CORRECT: Inline type imports
import { api, type Teacher, type Room } from '../services/api';

// ❌ WRONG: Separate imports
import type { Teacher } from '../services/api';
import { api } from '../services/api';
```

## Critical Files

### Core Application

- `App.tsx` - Root component with React Router setup
- `main.tsx` - Entry point, renders App with error boundary

### Hooks (Performance-Critical)

- `hooks/useRfidScanning.ts` - RFID scanning logic (always server-first, no local cache)
- `hooks/useNetworkStatus.ts` - Network quality monitoring

### Services (Business Logic)

- `services/api.ts` - All HTTP API calls to Project Phoenix backend
- (removed) früher: `services/studentCache.ts` für Offline-Cache; Live-Scans sind jetzt ausschließlich server-first
- `services/sessionStorage.ts` - Session persistence (Tauri IPC)
- `services/syncQueue.ts` - Offline operation retry queue

### State Management

- `store/userStore.ts` - Single Zustand store (1552 lines)
  - User authentication state
  - RFID scanning state
  - Session management
  - All app actions

### Utilities

- `utils/logger.ts` - Frontend logging (browser console + Rust persistence)
- `utils/storeMiddleware.ts` - Zustand action logging middleware
- `utils/tauriContext.ts` - Safe Tauri IPC wrapper (`safeInvoke`)
- `utils/errorBoundary.tsx` - React error boundary

## Performance Considerations (Raspberry Pi)

### Optimization Patterns

1. **Memoization**: Use `React.memo` for expensive components
2. **Lazy Loading**: Use `loading="lazy"` for images
3. **Debouncing**: Debounce search/filter operations
4. **CSS Transforms**: Use GPU-accelerated animations

### Avoid

- Inline functions in render (creates new function on every render)
- Large re-renders (batch Zustand updates)
- Heavy computations in render (use `useMemo`)

## Common Tasks

### Adding API Endpoint

See root `CLAUDE.md` → "Adding New Features" for complete workflow.

### Adding New Page

1. Create component in `pages/`
2. Add route in `App.tsx`
3. Add navigation from existing page

### Adding Custom Hook

1. Create in `hooks/`
2. Follow naming: `use[Name].ts`
3. Return object with clear API
4. Document usage in file comment

## Testing (When Implemented)

- Test files co-located: `Component.tsx` → `Component.test.tsx`
- Use React Testing Library for components
- Mock Zustand store for tests
- Mock Tauri IPC with `jest.mock('@tauri-apps/api/core')`
