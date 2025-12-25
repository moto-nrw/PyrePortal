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

1. **Add size presets to ModalBase** - support `size="sm" | "md" | "lg"` to match existing modal dimensions:
   - `sm`: 500px max-width, 48px padding, 20px radius (ErrorModal, SuccessModal, InfoModal)
   - `md`: 600px max-width, 56px padding, 24px radius (future use)
   - `lg`: 700px max-width, 64px padding, 32px radius (ActivityScanningPage scan modal)
2. **Add timeout indicator color props to ModalBase** - support `timeoutColor` and `timeoutTrackColor` to ensure visibility on light backgrounds (default white is invisible on white modals)
3. **Add default backdrop blur to ModalBase** - all modals get `backdrop-filter: blur(4px)` by default, with optional `backdropBlur` prop to customize
4. **Refactor ErrorModal, SuccessModal, InfoModal** to wrap ModalBase instead of implementing their own modal shell
5. **Migrate inline modals** in RoomSelectionPage (ConfirmationModal, ConflictModal), HomeViewPage (confirmation), and TagAssignmentPage (scanner overlay) to use ModalBase as container
6. **Hide ModalTimeoutIndicator export** - remove from public API (still used internally by ModalBase)
7. **Clean up dead code** - remove unused `@keyframes modalPop` from StaffSelectionPage

## Scope

### In Scope

- ModalBase enhancement (size presets, timeout indicator colors, backdropBlur prop)
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
- Timeout indicator visible on both light and dark modal backgrounds
- Modal sizes match their original dimensions (no visual size regression)
- `npm run check` passes
- SonarCloud quality gate passes
- No visual regression in modal appearance/behavior
