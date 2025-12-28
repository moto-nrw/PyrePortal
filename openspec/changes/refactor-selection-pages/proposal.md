# Change: Refactor Selection Pages into Shared Components

## Why

Five selection pages (`TeamManagementPage`, `StudentSelectionPage`, `StaffSelectionPage`, `CreateActivityPage`, `RoomSelectionPage`) share nearly identical patterns: 5x2 grid layout, pagination controls, selectable cards with checkmarks, empty slot rendering, and touch feedback. This duplication causes:

1. **SonarCloud violations**: `StudentSelectionPage` has cognitive complexity 45 (target: ≤15), `TeamManagementPage` has 25 (target: ≤15)
2. **~1500 lines of duplicated JSX/logic** across pages
3. **Inconsistent styling**: Minor differences in border-radius, colors, and behavior
4. **Maintenance burden**: Bug fixes must be applied to 5 places

## What Changes

- **NEW** `usePagination<T>` hook - Generic pagination logic (~50 lines)
- **NEW** `SelectableGrid` component - Renders 5x2 grid with selection state (~60 lines)
- **NEW** `SelectableCard` component - Individual card with icon, name, badge (~120 lines)
- **NEW** `EmptySlot` component - Placeholder for incomplete grid rows (~40 lines)
- **NEW** `PaginationControls` component - Prev/Next buttons with page indicator (~80 lines)
- **MODIFIED** `designSystem.ts` - Add `entityColors` constants for standardized icon colors
- **MODIFIED** All 5 selection pages - Refactor to use shared components

## Impact

- Affected specs: NEW `selectable-grid`, NEW `pagination-controls`, NEW `pagination-hook`
- Affected code:
  - `src/hooks/usePagination.ts` (new)
  - `src/components/ui/SelectableGrid/` (new directory)
  - `src/components/ui/PaginationControls.tsx` (new)
  - `src/styles/designSystem.ts` (modified)
  - `src/pages/TeamManagementPage.tsx` (refactored)
  - `src/pages/StudentSelectionPage.tsx` (refactored)
  - `src/pages/StaffSelectionPage.tsx` (refactored)
  - `src/pages/CreateActivityPage.tsx` (refactored)
  - `src/pages/RoomSelectionPage.tsx` (refactored)

## Success Metrics

- `StudentSelectionPage` cognitive complexity reduced from 45 to ≤12
- `TeamManagementPage` cognitive complexity reduced from 25 to ≤10
- Net line reduction: ~1150 lines (remove ~1500, add ~350)
- All existing functionality preserved
- Visual appearance unchanged (standardized to rgba tint pattern)
