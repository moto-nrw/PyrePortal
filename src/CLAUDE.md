# Frontend Architecture Context

This directory contains the React/TypeScript frontend for PyrePortal.

## Directory Structure

- **components/**: React components.
- **hooks/**: custom React hooks such as RFID scanning and network status.
- **pages/**: route-level full-screen views.
- **services/**: API, storage, and business logic helpers.
- **store/**: Zustand state management.
- **styles/**: design system and theme configuration.
- **utils/**: shared utilities.
- **platform/**: build-target adapters for GKT and browser/mock.

## Key Patterns

### State Management

- Use the single Zustand store in `store/userStore.ts`.
- Batch related `set()` calls.
- Keep logging middleware intact for action/state visibility.

### Platform Boundary

- Use `@platform` for platform-specific behavior.
- GKT production behavior belongs in `platform/gkt`.
- Browser/Mac mock behavior belongs in `platform/browser`.
- The Tauri adapter is legacy only; do not add new behavior there.

### Import Order

```typescript
import { useEffect, useState } from 'react';

import { api, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';
```

Prefer inline type imports:

```typescript
import { api, type Teacher, type Room } from '../services/api';
```

## Critical Files

- `App.tsx`: root component with React Router setup.
- `main.tsx`: app entry point and API initialization.
- `hooks/useRfidScanning.ts`: server-first RFID scanning flow.
- `services/api.ts`: Project Phoenix HTTP API.
- `services/sessionStorage.ts`: session persistence through the active platform adapter.
- `store/userStore.ts`: authentication, RFID, session, and UI state.
- `utils/logger.ts`: frontend logging.

## Performance Considerations

- Use `React.memo` for expensive components.
- Use `loading="lazy"` for non-critical images.
- Debounce search/filter operations.
- Use CSS transforms for animations.
- Avoid heavy computations during render; use `useMemo` when useful.

## Common Tasks

### Adding an API Endpoint

See root `CLAUDE.md` -> "Adding New Features".

### Adding a Page

1. Create a component in `pages/`.
2. Add the route in `App.tsx`.
3. Add navigation from the relevant existing page.

### Adding a Hook

1. Create it in `hooks/`.
2. Follow `use[Name].ts` naming.
3. Return a clear object API.
4. Add focused tests for behavior and edge cases.

## Testing

- Co-locate tests: `Component.tsx` -> `Component.test.tsx`.
- Use React Testing Library for components.
- Mock Zustand state and platform adapters where needed.
