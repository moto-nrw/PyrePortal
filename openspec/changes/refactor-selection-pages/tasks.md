# Tasks: Refactor Selection Pages

## 1. Create Shared Infrastructure

- [x] 1.1 Create `src/hooks/usePagination.ts` with generic pagination logic
- [x] 1.2 Add `entityColors` constants to `src/styles/designSystem.ts`
- [x] 1.3 Create `src/components/ui/SelectableGrid/types.ts` with shared interfaces
- [x] 1.4 Create `src/components/ui/SelectableGrid/SelectableCard.tsx`
- [x] 1.5 Create `src/components/ui/SelectableGrid/EmptySlot.tsx`
- [x] 1.6 Create `src/components/ui/SelectableGrid/SelectableGrid.tsx`
- [x] 1.7 Create `src/components/ui/SelectableGrid/index.ts` barrel export
- [x] 1.8 Create `src/components/ui/PaginationControls.tsx`
- [x] 1.9 Update `src/components/ui/index.ts` with new exports
- [x] 1.10 Run `npm run check` to verify new components compile

## 2. Refactor Selection Pages

- [x] 2.1 Refactor `StaffSelectionPage.tsx` to use shared components
- [x] 2.2 Run `npm run check` after StaffSelectionPage
- [x] 2.3 Refactor `TeamManagementPage.tsx` to use shared components
- [x] 2.4 Run `npm run check` after TeamManagementPage
- [x] 2.5 Refactor `CreateActivityPage.tsx` to use shared components
- [x] 2.6 Run `npm run check` after CreateActivityPage
- [x] 2.7 Refactor `RoomSelectionPage.tsx` to use shared components
- [x] 2.8 Run `npm run check` after RoomSelectionPage
- [x] 2.9 Refactor `StudentSelectionPage.tsx` to use shared components
- [x] 2.10 Run `npm run check` after StudentSelectionPage

## 3. Validation

- [x] 3.1 Run full `npm run check` to verify all TypeScript/ESLint passes
- [ ] 3.2 Verify SonarCloud cognitive complexity reduced (manual check after PR)
- [ ] 3.3 Visual verification of all 5 selection pages (manual testing)

## Dependencies

- Tasks 1.1-1.10 can be done in parallel (no interdependencies)
- Tasks 2.x must be sequential (each page depends on 1.x completion)
- Task 2.x depends on all 1.x tasks
- Tasks 3.x depend on all 2.x tasks
