# Design: Base Modal Component

## Component API

```typescript
interface ModalBaseProps {
  /** Controls modal visibility */
  isOpen: boolean;

  /** Called when modal should close (backdrop click, escape, timeout) */
  onClose: () => void;

  /** Modal content */
  children: React.ReactNode;

  // --- Visual Customization ---

  /** Background color of the modal container. Default: white */
  backgroundColor?: string;

  // --- Timeout ---

  /** Auto-close timeout in ms. Undefined = no auto-close */
  timeout?: number;

  /** Show the timeout progress indicator. Default: true when timeout is set */
  showTimeoutIndicator?: boolean;

  /** Key that resets the timeout when changed (e.g., scan ID) */
  timeoutResetKey?: string | number | null;

  /** Called when timeout expires (before onClose) */
  onTimeout?: () => void;

  // --- Behavior ---

  /** Allow closing by clicking backdrop. Default: true */
  closeOnBackdropClick?: boolean;
}
```

## Visual Specification

Extracted from ActivityScanningPage modal (lines 1214-1467):

### Backdrop

```css
position: fixed;
top: 0;
left: 0;
right: 0;
bottom: 0;
background-color: rgba(0, 0, 0, 0.7);
display: flex;
align-items: center;
justify-content: center;
z-index: 1000;
```

Note: No backdrop blur - matches current ActivityScanningPage behavior.

### Container

```css
background-color: {backgroundColor};
border-radius: 32px;
padding: 64px;
max-width: 700px;
width: 90%;
text-align: center;
box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
position: relative;
overflow: hidden;
```

### Timeout Indicator

- Uses existing `ModalTimeoutIndicator` component
- Position: bottom
- Height: 8px
- Color: white with 0.9 opacity (works on colored backgrounds)

## Component Structure

```
<Backdrop onClick={handleBackdropClick}>
  <Container onClick={stopPropagation}>
    {children}
    {showTimeoutIndicator && timeout && (
      <ModalTimeoutIndicator ... />
    )}
  </Container>
</Backdrop>
```

## Accessibility

- `role="dialog"` on container
- `aria-modal="true"` on container
- `aria-hidden="true"` on backdrop (decorative)

## Integration with Existing Code

### Reuses

- `ModalTimeoutIndicator` - existing component, no changes
- `useModalTimeout` - existing hook, no changes

### Replaces

- `Modal.tsx` - dead code, will be deleted

### Migrates

- ActivityScanningPage inline modal - replaced with ModalBase in this change

### Does Not Replace (yet)

- `SuccessModal.tsx` - future proposal
- `ErrorModal.tsx` - future proposal
- `InfoModal.tsx` - future proposal
- `RoomSelectionPage` modals - future proposal

## File Location

`src/components/ui/ModalBase.tsx`

Follows existing pattern of UI primitives in `src/components/ui/`.
