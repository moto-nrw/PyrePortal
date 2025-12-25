# Proposal: consolidate-modals

## Why

The frontend has 7+ modal implementations with duplicated logic:

- Each modal implements its own backdrop, positioning, and click-outside handling
- None use native `<dialog>` (accessibility issues flagged by SonarCloud)
- Auto-close timers are reimplemented in ErrorModal, SuccessModal separately
- ~400 lines of duplicated modal boilerplate across the codebase
- Inline `<style>` tags for animations in multiple files
- Dead code (`@keyframes modalPop` in StaffSelectionPage)

ModalBase was added in PR #151 but only ActivityScanningPage uses it.

## What Changes

1. **Add `backdropBlur` prop to ModalBase** - support optional backdrop blur effect (used by several existing modals)
2. **Refactor ErrorModal, SuccessModal, InfoModal** to wrap ModalBase instead of implementing their own modal shell
3. **Migrate inline modals** in RoomSelectionPage (ConfirmationModal, ConflictModal), HomeViewPage (confirmation), and TagAssignmentPage (scanner overlay) to use ModalBase as container
4. **Hide ModalTimeoutIndicator export** - remove from public API (still used internally by ModalBase)
5. **Clean up dead code** - remove unused `@keyframes modalPop` from StaffSelectionPage

## Scope

### In Scope

- ModalBase enhancement (backdropBlur prop)
- ErrorModal, SuccessModal, InfoModal refactoring
- RoomSelectionPage ConfirmationModal and ConflictModal migration
- HomeViewPage confirmation modal migration
- TagAssignmentPage scanner overlay migration
- ModalTimeoutIndicator export removal (internal-only)
- Dead animation code cleanup

### Out of Scope

- ActivityScanningPage (already migrated)
- New modal features beyond consolidation
- Extracting modal content into separate components (content stays inline)

## Success Criteria

- All modals use ModalBase as their foundation
- No duplicate backdrop/positioning code
- ModalTimeoutIndicator no longer exported (internal to ModalBase)
- `npm run check` passes
- SonarCloud quality gate passes
- No visual regression in modal appearance/behavior
