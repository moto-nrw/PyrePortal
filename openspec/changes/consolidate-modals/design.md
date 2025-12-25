# Design: consolidate-modals

## ModalBase Enhancement

Add `backdropBlur` prop to support existing modals that use backdrop blur:

```tsx
interface ModalBaseProps {
  // ... existing props ...

  /** Backdrop blur amount (e.g., '4px', '8px'). Default: undefined (no blur) */
  backdropBlur?: string;
}
```

Implementation uses CSS custom property on the dialog element, with `::backdrop` pseudo-element consuming it:

```css
/* index.css */
dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: var(--modal-backdrop-blur, none);
  -webkit-backdrop-filter: var(--modal-backdrop-blur, none);
}
```

```tsx
// ModalBase.tsx
<dialog
  ref={dialogRef}
  style={{
    // ... existing styles ...
    '--modal-backdrop-blur': backdropBlur ? `blur(${backdropBlur})` : 'none',
  } as React.CSSProperties}
>
```

## Architecture

Three-layer modal system:

```
┌─────────────────────────────────────────────────────────┐
│  ModalBase (native <dialog>, a11y, backdrop, timeout)   │
│  - Handles: open/close, backdrop click, ESC key         │
│  - Handles: timeout with visual indicator               │
│  - Handles: focus trapping, aria attributes             │
└─────────────────────────────────────────────────────────┘
                          ▲
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
    │ ErrorModal │   │SuccessModal│   │ InfoModal │
    │  variant   │   │  variant   │   │  variant  │
    │ (red icon) │   │(green icon)│   │(blue icon)│
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │               │               │
    Props: message   Props: message   Props: title,
           onClose         onClose         message,
           autoClose?      autoClose?      onClose
```

## Variant Modals (ErrorModal, SuccessModal, InfoModal)

Each variant modal becomes a thin wrapper:

```tsx
// ErrorModal.tsx - after refactoring
export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  message,
  autoCloseDelay = 3000,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onClose}
    timeout={autoCloseDelay}
    backgroundColor={theme.colors.background.light}
  >
    <div className="error-icon">
      <FontAwesomeIcon icon={faCircleXmark} />
    </div>
    <h2>Fehler</h2>
    <p>{message}</p>
  </ModalBase>
);
```

## Inline Modals (RoomSelectionPage, HomeViewPage, TagAssignmentPage)

Local modal components keep their content but replace the shell:

```tsx
// Before (RoomSelectionPage ConfirmationModal)
const ConfirmationModal = ({ isOpen, onConfirm, onCancel, ... }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', ... }}> {/* backdrop */}
      <div role="dialog" ...>                 {/* container */}
        {/* 100+ lines of content */}
      </div>
    </div>
  );
};

// After
const ConfirmationModal = ({ isOpen, onConfirm, onCancel, ... }) => (
  <ModalBase isOpen={isOpen} onClose={onCancel}>
    {/* Same 100+ lines of content, no shell code */}
  </ModalBase>
);
```

## Files Changed

| File                                 | Change                                   |
| ------------------------------------ | ---------------------------------------- |
| `src/components/ui/ModalBase.tsx`    | Add backdropBlur prop                    |
| `src/index.css`                      | Update dialog::backdrop for blur support |
| `src/components/ui/ErrorModal.tsx`   | Refactor to use ModalBase                |
| `src/components/ui/SuccessModal.tsx` | Refactor to use ModalBase                |
| `src/components/InfoModal.tsx`       | Refactor to use ModalBase                |
| `src/components/ui/index.ts`         | Remove ModalTimeoutIndicator export      |
| `src/pages/RoomSelectionPage.tsx`    | Migrate ConfirmationModal, ConflictModal |
| `src/pages/HomeViewPage.tsx`         | Migrate confirmation modal               |
| `src/pages/TagAssignmentPage.tsx`    | Migrate scanner overlay                  |
| `src/pages/StaffSelectionPage.tsx`   | Remove dead @keyframes code              |

## Estimated Line Reduction

| Component                    | Before | After | Saved    |
| ---------------------------- | ------ | ----- | -------- |
| ErrorModal                   | 83     | ~25   | ~58      |
| SuccessModal                 | 125    | ~35   | ~90      |
| InfoModal                    | 169    | ~50   | ~119     |
| ModalTimeoutIndicator export | 1      | 0     | 1        |
| RoomSelectionPage modals     | ~650   | ~500  | ~150     |
| HomeViewPage modal           | ~80    | ~40   | ~40      |
| TagAssignmentPage overlay    | ~50    | ~20   | ~30      |
| **Total**                    |        |       | **~488** |

## Risks

1. **Visual regression** - Modal styling may differ slightly. Mitigation: Manual visual testing on each page.
2. **Animation differences** - ModalBase uses CSS animations in index.css. Inline `<style>` tags will be removed. Mitigation: Ensure equivalent animations exist.
3. **Auto-close timing** - ModalBase uses `timeout` prop vs `autoCloseDelay`. Mitigation: Map props correctly.
