# Components Architecture

## Directory Structure

### ui/ - Reusable UI Primitives

- `PillButton/` - Shared pill-shaped button primitive for primary, action, and secondary button variants.
- `BackButton.tsx` - Navigation button wrapper around `PillButton` with the standard back affordance.
- `ModalBase.tsx` - Shared native-dialog modal shell with timeout, backdrop, size, and layout handling.
- `ModalActionButtons.tsx` - Shared confirm/cancel action row for modal workflows.
- `ErrorModal.tsx` - Standard user-facing error modal built on `ModalBase`.
- `SuccessModal.tsx` - Standard user-facing success modal built on `ModalBase`.
- `SelectionPageLayout.tsx` - Shared full-screen selection page layout with background, loading, error, and back handling.
- `SelectableGrid/` - Shared selectable card grid, card, empty slot, icon, and type primitives.
- `PaginationControls.tsx` - Shared previous/next controls for paged selection lists.
- `LoadingSpinner.tsx` - Shared loading indicator used by selection layouts.
- `NetworkStatus.tsx` - Network quality indicator.
- `RfidProcessingIndicator.tsx` - RFID processing indicator for tag assignment.

### Feature Components (Root)

- `background-wrapper.tsx` and `animated-background.tsx` - Shared page background wrapper and canvas animation.
- `LastSessionToggle.tsx` - Toggle to reuse previous session settings.
- `ProtectedRoute.tsx` - Auth/condition guard for routed pages.
- `RfidServiceInitializer.tsx` - Initializes the active platform RFID service on app startup.

## Component Patterns

### Buttons

Use `PillButton` for general action buttons and `BackButton` for navigation back actions.

```typescript
import BackButton from './ui/BackButton';
import { PillButton } from './ui/PillButton';

<PillButton variant="primary" onClick={handleSave} disabled={!canSave}>
  Speichern
</PillButton>;

<PillButton variant="action" onClick={handleStart}>
  Scan starten
</PillButton>;

<BackButton onClick={() => navigate('/home')} />;
```

Keep `BackButton` as the standard navigation primitive unless a screen needs unusual back behavior.

### Modals

Use `ModalBase` for custom modal content. Use `ErrorModal` and `SuccessModal` for simple status feedback.

```typescript
import { ErrorModal, ModalActionButtons, ModalBase } from './ui';

<ModalBase isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Aktion bestätigen">
  <p>Diese Aktion wirklich ausführen?</p>
  <ModalActionButtons
    onConfirm={handleConfirm}
    onCancel={() => setShowConfirm(false)}
    confirmLabel="Bestätigen"
    cancelLabel="Abbrechen"
  />
</ModalBase>;

<ErrorModal
  isOpen={!!error}
  onClose={() => setError(null)}
  message={error ?? ''}
/>;
```

### Selection Pages

Use `SelectionPageLayout` with `SelectableGrid`, `SelectableCard`, `PaginationControls`, and `usePagination` for staff, student, activity, and room selection flows.

```typescript
<SelectionPageLayout title="Person auswählen" onBack={handleBack} isLoading={isLoading}>
  <SelectableGrid
    items={visibleItems}
    renderItem={item => (
      <SelectableCard
        key={item.id}
        title={item.name}
        icon="person"
        colorType="person"
        onClick={() => selectItem(item)}
      />
    )}
  />
  <PaginationControls
    currentPage={currentPage}
    totalPages={totalPages}
    canGoPrev={canGoPrev}
    canGoNext={canGoNext}
    onPrevPage={goToPrevPage}
    onNextPage={goToNextPage}
  />
</SelectionPageLayout>
```

## Styling Conventions

- Prefer `designSystem` constants (`src/styles/designSystem.ts`) for shared colors, spacing, radii, shadows, and typography.
- Use Tailwind utility classes for layout where existing pages already do so.
- Keep UI-facing text German and log messages English.
- Preserve touch-friendly sizing for kiosk use.
- Use CSS transforms for animation where possible.

## State Management in Components

### Zustand Store Access

```typescript
import { useUserStore } from '../store/userStore';

function MyComponent() {
  const { authenticatedUser, fetchTeachers } = useUserStore();

  // Use local state for view-only concerns.
  const [showErrorModal, setShowErrorModal] = useState(false);
}
```

### Local State vs Store

- Use local state for UI-only state such as modal visibility, selected filters, and transient form input.
- Use the Zustand store for shared session, auth, RFID, network, and API-backed state.
- Keep RFID workflow state in the existing store/actions instead of creating local duplicate state.

## Common Component Tasks

### Adding a UI Primitive

1. Check whether `PillButton`, `ModalBase`, `SelectionPageLayout`, or `SelectableGrid` already fits.
2. Add a new primitive under `ui/` only when it removes meaningful duplication.
3. Export from `ui/index.ts` only if multiple production modules should import it through the barrel.
4. Add focused tests for behavior and accessibility-relevant states.

### Adding a Modal

1. Use `ErrorModal` or `SuccessModal` for simple feedback.
2. Use `ModalBase` plus `ModalActionButtons` for custom confirmation or multi-step content.
3. Preserve close, timeout, disabled/loading, and focus behavior expected by existing modals.

## Performance Tips

- Use `React.memo` for repeated grid/card components.
- Use `useMemo` for expensive filtered or sorted lists.
- Use `useCallback` when passing handlers into memoized repeated components.
- Avoid creating components inside render.
- Avoid large inline objects/arrays in props to memoized children.
