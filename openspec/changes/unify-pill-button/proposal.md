# Proposal: Unify Pill Button Component

## Change ID

`unify-pill-button`

## Summary

Create a unified `PillButton` base component with three variants (primary/action/secondary) that standardizes all action buttons to 68px height with consistent touch feedback, replacing scattered inline button implementations across the application.

## Problem Statement

The codebase has inconsistent button implementations:

- **Height variance:** Buttons range from 56px to 72px with no clear standard
- **Dead code:** `Button.tsx` uses legacy `theme.ts` and has zero imports (now deleted)
- **Duplication:** Touch feedback logic duplicated across 6+ pages
- **Mixed styling:** Some use `designSystem.ts`, others use hardcoded values
- **Maintenance burden:** Changing button styling requires edits in 10+ locations
- **Inconsistent touch feedback:** BackButton uses scale(0.95), ContinueButton uses scale(0.98)

## Proposed Solution

1. **Create `PillButton` base component** with:
   - Three variants: `primary` (green), `action` (blue), `secondary` (glass)
   - Standardized 68px height
   - Unified touch feedback (scale 0.95)
   - Variant-specific typography (26px for CTAs, 20px for navigation)

2. **Refactor `BackButton` and `ContinueButton`** to be thin wrappers around `PillButton`

3. **Standardize all action buttons** in pages to use 68px height (Issue #160)

## Scope

### In Scope

- New `PillButton` component with `primary`, `action`, and `secondary` variants
- Refactoring existing `BackButton.tsx` and `ContinueButton.tsx`
- Standardizing button heights in: TagAssignmentPage, HomeViewPage, RoomSelectionPage, StudentSelectionPage, TeamManagementPage, ActivityScanningPage
- Removing dead `Button.tsx` (already done)

### Out of Scope

- Theme consolidation (`theme.ts` → `designSystem.ts`) - separate effort
- Selection card buttons (160px grid items) - different component type
- Filter chips (40px) - different component type
- Pagination buttons (text-only) - different component type

## Success Criteria

- All action buttons use 68px height
- `BackButton` and `ContinueButton` significantly reduced (currently 138 and 97 lines)
- Unified touch feedback (scale 0.95) across all buttons
- `npm run check` passes
- Visual appearance of existing buttons unchanged (except height standardization)

## Related Issues

- GitHub Issue #160: Standardize action button heights to 68px across all pages
- GitHub Issue #154: Unify code for buttons (completed - merged PR #159)

## Stakeholders

- @yungweng - Requester, Frontend Lead
