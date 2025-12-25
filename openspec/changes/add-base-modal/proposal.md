# Proposal: Add Base Modal Component

## Summary

Create a unified `ModalBase` component that extracts the proven modal pattern from ActivityScanningPage. This is the foundation layer that will be used to refactor the inline modal code in ActivityScanningPage first, then extended to other modals later.

## Problem

ActivityScanningPage contains ~250 lines of inline modal JSX that works well but is not reusable. The modal pattern there is the "gold standard" with:

- Proper timeout handling via `useModalTimeout` hook
- Visual timeout indicator via `ModalTimeoutIndicator`
- Click-to-dismiss on backdrop
- Consistent styling (32px radius, 64px padding, 700px max-width)

This pattern should be extracted into a reusable component.

Additionally, `Modal.tsx` exists but is dead code (exported but never imported anywhere).

## Solution

Create `ModalBase` - a component that extracts the ActivityScanningPage modal pattern:

- **Backdrop:** Dark overlay (`rgba(0, 0, 0, 0.7)`) without blur (matching current behavior)
- **Container:** 32px border radius, 64px padding, max-width 700px
- **Timeout system:** Integrated `useModalTimeout` hook + `ModalTimeoutIndicator`
- **Click-to-dismiss:** Configurable backdrop click handling

`ModalBase` renders the backdrop and container shell. Children provide content (icons, text, buttons).

## Scope

**In scope:**

- Create `ModalBase.tsx` component matching ActivityScanningPage modal styling
- Integrate with existing `ModalTimeoutIndicator` and `useModalTimeout`
- Delete unused `Modal.tsx`

**Out of scope (future changes):**

- Migrating ActivityScanningPage to use `ModalBase` (separate proposal after this works)
- Migrating other modals (ErrorModal, SuccessModal, InfoModal, RoomSelectionPage modals)
- Adding blur or other visual changes (will be decided when migrating other modals)

## Impact

- **Files added:** `src/components/ui/ModalBase.tsx`
- **Files removed:** `src/components/ui/Modal.tsx` (dead code)
- **Files modified:** `src/components/ui/index.ts` (update exports)

No breaking changes - ActivityScanningPage keeps its inline modal until we verify ModalBase works correctly.
