# Components Architecture

## Directory Structure

### ui/ - Reusable UI Primitives

- `ActionButton.tsx` - Large action buttons for primary actions
- `BackButton.tsx` - Navigation back button with arrow icon
- `Button.tsx` - Base button component (all variants)
- `ContentBox.tsx` - Content container wrapper with consistent styling
- `ErrorModal.tsx` - Error display modal
- `Modal.tsx` - Base modal component
- `NetworkStatus.tsx` - Network quality indicator
- `Select.tsx` - Dropdown select component
- `SuccessModal.tsx` - Success feedback modal

### Feature Components (Root)

- `InfoModal.tsx` - Information display modal
- `LastSessionToggle.tsx` - Toggle to load previous session settings
- `RfidServiceInitializer.tsx` - Initializes RFID service on app startup

## Component Patterns

### UI Component Template

```typescript
import type { ReactNode } from 'react';

interface ComponentProps {
  // Props
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Component({ children, className = '', onClick }: ComponentProps) {
  return (
    <div className={`base-styles ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
```

### Modal Pattern

All modals extend base `Modal.tsx`:

```typescript
import { Modal } from './ui/Modal';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

export function ErrorModal({ isOpen, onClose, message }: ErrorModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2>Fehler</h2>
        <p>{message}</p>
        <Button onClick={onClose}>Schließen</Button>
      </div>
    </Modal>
  );
}
```

### Button Variants

```typescript
// Primary action (large, prominent)
<ActionButton onClick={handleAction}>
  Aktion starten
</ActionButton>

// Secondary action (standard size)
<Button variant="secondary" onClick={handleAction}>
  Abbrechen
</Button>

// Navigation back
<BackButton onClick={() => navigate(-1)} />
```

## Styling Conventions

### Tailwind CSS Classes

- Use design system tokens from `../styles/designSystem.ts`
- Primary color: `bg-primary` (#24c8db)
- Container: `ContentBox` component for consistent padding/shadows

### Responsive Design

- Mobile-first approach (base styles for mobile)
- Kiosk mode: Fullscreen, no responsive breakpoints needed
- Font sizes optimized for touch (min 16px)

### Animation

- Use CSS transforms (GPU-accelerated on Pi)
- Avoid JavaScript animations
- Transitions: `transition-all duration-200`

## State Management in Components

### Zustand Store Access

```typescript
import { useUserStore } from '../store/userStore';

function MyComponent() {
  // Select only needed state (prevents unnecessary re-renders)
  const { users, fetchUsers } = useUserStore(state => ({
    users: state.users,
    fetchUsers: state.fetchUsers,
  }));

  // Or use shallow comparison
  const { users, fetchUsers } = useUserStore();
}
```

### Local State vs Store

- **Local state** (`useState`): UI-only state (modal open/closed, form input)
- **Store state**: Shared state, persisted data, API responses

## Common Component Tasks

### Adding New UI Component

1. Create in `ui/` directory
2. Export from `ui/index.ts` (barrel file)
3. Use design system tokens
4. Add TypeScript props interface
5. Document props with JSDoc if complex

### Adding Modal

1. Extend base `Modal.tsx`
2. Add to parent component's state: `const [showModal, setShowModal] = useState(false)`
3. Control with `isOpen` prop

### Error Handling in Components

```typescript
function MyComponent() {
  const { error } = useUserStore();

  return (
    <>
      {/* Main content */}
      <ErrorModal
        isOpen={!!error}
        onClose={() => useUserStore.setState({ error: null })}
        message={error || ''}
      />
    </>
  );
}
```

## Performance Tips

### Memoization

```typescript
// Expensive component
const MemoizedComponent = memo(ExpensiveComponent);

// Expensive computation
const sortedItems = useMemo(() => items.sort((a, b) => a.name.localeCompare(b.name)), [items]);
```

### Callback Stability

```typescript
// Stable callback reference
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

### Avoid

- Creating components inside render
- Inline object/array props (creates new reference every render)
- Large lists without keys
