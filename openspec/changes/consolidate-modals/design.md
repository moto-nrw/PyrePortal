# Design: consolidate-modals

## ModalBase Enhancement

### Size Presets

Add `size` prop to match existing modal dimensions and prevent visual regression:

```tsx
type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_PRESETS = {
  sm: { maxWidth: '500px', padding: '48px', borderRadius: '20px' }, // ErrorModal, SuccessModal, InfoModal
  md: { maxWidth: '600px', padding: '56px', borderRadius: '24px' }, // Future use
  lg: { maxWidth: '700px', padding: '64px', borderRadius: '32px' }, // ActivityScanningPage (current default)
};

interface ModalBaseProps {
  // ... existing props ...

  /** Modal size preset. Default: 'lg' (backwards compatible) */
  size?: ModalSize;
}
```

**Rationale**: Standardize all variant modals (ErrorModal, SuccessModal, InfoModal) to the same dimensions using `size="sm"`. This simplifies the system while ActivityScanningPage keeps `size="lg"` (default).

### Timeout Indicator Colors

Add color props to ModalBase that pass through to ModalTimeoutIndicator:

```tsx
interface ModalBaseProps {
  // ... existing props ...

  /** Timeout indicator bar color. Default: determined by background contrast */
  timeoutColor?: string;

  /** Timeout indicator track color. Default: determined by background contrast */
  timeoutTrackColor?: string;
}
```

**Auto-contrast logic**: If neither color is specified, ModalBase calculates contrast based on `backgroundColor`:

- Light backgrounds (white, #fff, etc.) → dark indicator (gray with 60% opacity)
- Dark/colored backgrounds → white indicator (current default)

```tsx
// ModalBase.tsx
const getContrastColors = (bg: string) => {
  // Simple heuristic: check if background is light
  const isLight = bg === '#FFFFFF' || bg === 'white' || bg.toLowerCase() === '#fff';
  return isLight
    ? { color: 'rgba(0, 0, 0, 0.3)', trackColor: 'rgba(0, 0, 0, 0.1)' }
    : { color: 'rgba(255, 255, 255, 0.9)', trackColor: 'rgba(255, 255, 255, 0.2)' };
};

// In component:
const indicatorColors = {
  color: timeoutColor ?? getContrastColors(backgroundColor).color,
  trackColor: timeoutTrackColor ?? getContrastColors(backgroundColor).trackColor,
};
```

### Backdrop Blur

All modals get backdrop blur by default (`blur(4px)`). Optional `backdropBlur` prop to customize:

```tsx
interface ModalBaseProps {
  // ... existing props ...

  /** Backdrop blur amount. Default: '4px' */
  backdropBlur?: string;
}
```

Implementation uses CSS custom property on the dialog element:

```css
/* index.css */
dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: var(--modal-backdrop-blur, blur(4px));
  -webkit-backdrop-filter: var(--modal-backdrop-blur, blur(4px));
}
```

```tsx
// ModalBase.tsx
<dialog
  style={{
    '--modal-backdrop-blur': backdropBlur ? `blur(${backdropBlur})` : undefined,
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

Each variant modal becomes a thin wrapper using `size="sm"` to match original dimensions:

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
    size="sm" // ← Matches original 500px/48px
    backgroundColor={theme.colors.background.light}
    // timeoutColor auto-detected as dark for light background
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

| File                                          | Change                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/components/ui/ModalBase.tsx`             | Add size, timeoutColor, timeoutTrackColor, backdropBlur props |
| `src/components/ui/ModalTimeoutIndicator.tsx` | No changes (colors passed from ModalBase)                     |
| `src/index.css`                               | Update dialog::backdrop for blur support                      |
| `src/components/ui/ErrorModal.tsx`            | Refactor to use ModalBase with size="sm"                      |
| `src/components/ui/SuccessModal.tsx`          | Refactor to use ModalBase with size="sm"                      |
| `src/components/InfoModal.tsx`                | Refactor to use ModalBase with size="sm"                      |
| `src/components/ui/index.ts`                  | Remove ModalTimeoutIndicator export                           |
| `src/pages/RoomSelectionPage.tsx`             | Migrate ConfirmationModal, ConflictModal                      |
| `src/pages/HomeViewPage.tsx`                  | Migrate confirmation modal                                    |
| `src/pages/TagAssignmentPage.tsx`             | Migrate scanner overlay                                       |
| `src/pages/StaffSelectionPage.tsx`            | Remove dead @keyframes code                                   |

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

1. **Visual regression** - Modal styling may differ slightly. Mitigation: Size presets match existing dimensions exactly; manual visual testing on each page.
2. **Animation differences** - ModalBase uses CSS animations in index.css. Inline `<style>` tags will be removed. Mitigation: Ensure equivalent animations exist.
3. **Auto-close timing** - ModalBase uses `timeout` prop vs `autoCloseDelay`. Mitigation: Map props correctly.
4. **Timeout indicator visibility** - White indicator invisible on white backgrounds. Mitigation: Auto-contrast detection based on backgroundColor prop; dark indicator for light backgrounds, white for colored backgrounds.
