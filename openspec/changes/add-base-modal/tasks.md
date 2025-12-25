# Tasks: Add Base Modal Component

## Prerequisites

- [ ] Review existing `ModalTimeoutIndicator` component API
- [ ] Review existing `useModalTimeout` hook API

## Implementation

1. [ ] **Create ModalBase component**
   - File: `src/components/ui/ModalBase.tsx`
   - Implement props interface as specified in design.md
   - Implement backdrop with blur and configurable opacity
   - Implement container with consistent styling
   - Integrate `useModalTimeout` hook for timeout management
   - Integrate `ModalTimeoutIndicator` for visual timeout display
   - Add keyboard (Escape) handling
   - Add body scroll prevention

2. [ ] **Export from barrel file**
   - File: `src/components/ui/index.ts`
   - Add `export { ModalBase } from './ModalBase'`

3. [ ] **Delete dead code**
   - Delete: `src/components/ui/Modal.tsx`
   - Update: `src/components/ui/index.ts` (remove Modal export)

## Validation

4. [ ] **Manual testing**
   - Create a test usage in a dev page or storybook
   - Verify backdrop blur works
   - Verify click-to-dismiss works
   - Verify Escape key works
   - Verify timeout and indicator work
   - Verify timeout reset (via resetKey) works

5. [ ] **Type checking**
   - Run `npm run check` - must pass with no errors

## Notes

- Tasks 1-3 can be done in sequence
- Task 4 is manual verification before commit
- Task 5 is final validation gate
