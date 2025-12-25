# Tasks: Add Base Modal Component

## Prerequisites

- [x] Review existing `ModalTimeoutIndicator` component API
- [x] Review existing `useModalTimeout` hook API

## Implementation

1. [x] **Create ModalBase component**
   - File: `src/components/ui/ModalBase.tsx`
   - Implement props interface as specified in design.md
   - Implement backdrop with dark overlay (no blur)
   - Implement container with consistent styling
   - Integrate `useModalTimeout` hook for timeout management
   - Integrate `ModalTimeoutIndicator` for visual timeout display

2. [x] **Export from barrel file**
   - File: `src/components/ui/index.ts`
   - Add `export { ModalBase } from './ModalBase'`

3. [x] **Migrate ActivityScanningPage to use ModalBase**
   - File: `src/pages/ActivityScanningPage.tsx`
   - Replace ~250 lines of inline modal JSX with ModalBase
   - Keep all existing functionality (icons, content, buttons)
   - Ensure visual appearance is identical

4. [x] **Delete dead code**
   - Delete: `src/components/ui/Modal.tsx`
   - Update: `src/components/ui/index.ts` (remove Modal export)

## Validation

5. [ ] **Manual testing in ActivityScanningPage**
   - Verify check-in modal displays correctly
   - Verify check-out modal displays correctly
   - Verify daily checkout flow works
   - Verify feedback prompt works
   - Verify click-to-dismiss works
   - Verify timeout and indicator work
   - Verify timeout reset on new scan works

6. [x] **Type checking**
   - Run `npm run check` - must pass with no errors

## Notes

- Tasks 1-4 are sequential (each depends on previous)
- Task 5 is manual verification before commit
- Task 6 is final validation gate
