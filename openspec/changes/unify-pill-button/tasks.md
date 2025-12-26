# Tasks: Unify Pill Button Component

## 1. Create PillButton Component

- [x] 1.1 Create `src/components/ui/PillButton/PillButton.types.ts` with PillButtonProps interface (variants: primary/action/secondary)
- [x] 1.2 Create `src/components/ui/PillButton/PillButton.tsx` with base component (68px height, 3 variants, unified scale 0.95 touch feedback)
- [x] 1.3 Create `src/components/ui/PillButton/index.ts` barrel export
- [x] 1.4 Add PillButton export to `src/components/ui/index.ts`

## 2. Refactor Existing Button Components

- [x] 2.1 Refactor `BackButton.tsx` to use PillButton variant="secondary" internally (138 → 87 lines)
- [x] 2.2 Refactor `ContinueButton.tsx` to use PillButton variant="primary" internally (97 → 30 lines)

## 3. Standardize Page Buttons (Issue #160)

- [x] 3.1 TagAssignmentPage: "Scan starten" 72px→68px (uses action variant blue)
- [x] 3.2 TagAssignmentPage: "Neue Person zuweisen" 64px→68px, "Neuer Scan" 64px→68px
- [x] 3.3 HomeViewPage: Modal buttons 56px→68px
- [x] 3.4 RoomSelectionPage: 4 modal buttons 64px→68px
- [x] 3.5 StudentSelectionPage: "Armband zuweisen" 64px→68px
- [x] 3.6 TeamManagementPage: "Team speichern" 72px→68px
- [x] 3.7 ActivityScanningPage: Audited - feedback buttons use padding-based sizing (icon buttons, not action buttons)

## 4. Verification

- [x] 4.1 Run `npm run check` - all checks pass
- [x] 4.2 Visual verification: buttons look correct with new heights
- [x] 4.3 Touch feedback verification: all buttons use scale(0.95)
