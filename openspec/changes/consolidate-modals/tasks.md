# Tasks: consolidate-modals

## Phase 0: ModalBase Enhancement

- [x] **0.1** Add size presets to ModalBase
  - Add `ModalSize = 'sm' | 'md' | 'lg'` type
  - Add `SIZE_PRESETS` constant with dimensions:
    - `sm`: { maxWidth: '500px', padding: '48px', borderRadius: '20px' } (ErrorModal, SuccessModal, InfoModal)
    - `md`: { maxWidth: '600px', padding: '56px', borderRadius: '24px' } (future use)
    - `lg`: { maxWidth: '700px', padding: '64px', borderRadius: '32px' } (ActivityScanningPage)
  - Add `size?: ModalSize` prop, default to 'lg' for backwards compatibility
  - Apply preset values to container div styles

- [x] **0.2** Add timeout indicator color props to ModalBase
  - Add `timeoutColor?: string` prop
  - Add `timeoutTrackColor?: string` prop
  - Implement `getContrastColors(backgroundColor)` helper:
    - Light backgrounds → dark indicator colors
    - Dark/colored backgrounds → white indicator colors (current default)
  - Pass resolved colors to ModalTimeoutIndicator

- [x] **0.3** Add default backdrop blur to ModalBase
  - Update `src/index.css` dialog::backdrop with default `backdrop-filter: blur(4px)`
  - Add `backdropBlur?: string` prop for customization
  - Set CSS custom property `--modal-backdrop-blur` only when prop is provided
  - Include `-webkit-backdrop-filter` for Safari support

## Phase 1: Shared Component Refactoring

- [x] **1.1** Refactor ErrorModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Use `size="sm"` to match original dimensions
  - Keep icon, title, message content
  - Map `autoCloseDelay` to ModalBase `timeout` prop
  - Verify timeout indicator is visible (dark on white)

- [x] **1.2** Refactor SuccessModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Use `size="sm"` to match original dimensions
  - Keep icon, title, message content
  - Remove inline `<style>` tag (animation handled by ModalBase)
  - Map `autoCloseDelay` to ModalBase `timeout` prop
  - Verify timeout indicator is visible (dark on white)

- [x] **1.3** Refactor InfoModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Use `size="sm"` (standardized to match ErrorModal/SuccessModal)
  - Backdrop blur comes from ModalBase default (4px)
  - Keep icon, title, message, button content
  - Remove inline `<style>` tag
  - Remove manual Escape key handler (ModalBase handles this)

- [x] **1.4** Remove ModalTimeoutIndicator from public exports
  - Update `src/components/ui/index.ts` to remove export
  - File stays (used internally by ModalBase)
  - Verify no external imports of ModalTimeoutIndicator

## Phase 2: Page Modal Migrations

- [x] **2.1** Migrate RoomSelectionPage ConfirmationModal
  - Replace div-based shell with ModalBase
  - Keep activity details, supervisor list, buttons inline
  - Remove backdrop/positioning code

- [x] **2.2** Migrate RoomSelectionPage ConflictModal
  - Replace div-based shell with ModalBase
  - Keep conflict message, action buttons inline
  - Remove backdrop/positioning code

- [x] **2.3** Migrate HomeViewPage confirmation modal
  - Replace inline modal implementation with ModalBase
  - Keep last session details content

- [x] **2.4** Migrate TagAssignmentPage scanner overlay
  - Replace div-based overlay with ModalBase
  - Keep scanning icon and message content
  - Consider if this is semantically a modal or loading state

## Phase 3: Cleanup

- [x] **3.1** Remove dead code from StaffSelectionPage
  - Delete unused `@keyframes modalPop` CSS

- [x] **3.2** Run validation
  - `npm run check` passes (lint + types)
  - `npm run format` applied
  - Manual visual test of each modal

## Verification

- [x] All modals open/close correctly
- [x] Modal sizes match original dimensions (no visual size regression)
- [x] Timeout indicator visible on light backgrounds (ErrorModal, SuccessModal, InfoModal)
- [x] Timeout indicator visible on colored backgrounds (ActivityScanningPage scan modal)
- [x] Backdrop click dismisses modals (where applicable)
- [x] Auto-close timers work on ErrorModal, SuccessModal
- [x] Escape key closes modals
- [x] No console errors or warnings
- [x] SonarCloud quality gate passes (requires CI run)
