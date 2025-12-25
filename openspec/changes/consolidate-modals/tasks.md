# Tasks: consolidate-modals

## Phase 0: ModalBase Enhancement

- [ ] **0.1** Add backdropBlur prop to ModalBase
  - Add `backdropBlur?: string` to ModalBaseProps interface
  - Set CSS custom property `--modal-backdrop-blur` on dialog element
  - Update `src/index.css` dialog::backdrop to use `backdrop-filter: var(--modal-backdrop-blur, none)`
  - Include `-webkit-backdrop-filter` for Safari support

## Phase 1: Shared Component Refactoring

- [ ] **1.1** Refactor ErrorModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Keep icon, title, message content
  - Map `autoCloseDelay` to ModalBase `timeout` prop
  - Verify auto-close behavior works

- [ ] **1.2** Refactor SuccessModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Keep icon, title, message content
  - Remove inline `<style>` tag (animation handled by ModalBase)
  - Map `autoCloseDelay` to ModalBase `timeout` prop

- [ ] **1.3** Refactor InfoModal to use ModalBase
  - Replace div-based modal shell with ModalBase wrapper
  - Keep icon, title, message, button content
  - Remove inline `<style>` tag
  - Remove manual Escape key handler (ModalBase handles this)

- [ ] **1.4** Remove ModalTimeoutIndicator from public exports
  - Update `src/components/ui/index.ts` to remove export
  - File stays (used internally by ModalBase)
  - Verify no external imports of ModalTimeoutIndicator

## Phase 2: Page Modal Migrations

- [ ] **2.1** Migrate RoomSelectionPage ConfirmationModal
  - Replace div-based shell with ModalBase
  - Keep activity details, supervisor list, buttons inline
  - Remove backdrop/positioning code

- [ ] **2.2** Migrate RoomSelectionPage ConflictModal
  - Replace div-based shell with ModalBase
  - Keep conflict message, action buttons inline
  - Remove backdrop/positioning code

- [ ] **2.3** Migrate HomeViewPage confirmation modal
  - Replace inline modal implementation with ModalBase
  - Keep last session details content

- [ ] **2.4** Migrate TagAssignmentPage scanner overlay
  - Replace div-based overlay with ModalBase
  - Keep scanning icon and message content
  - Consider if this is semantically a modal or loading state

## Phase 3: Cleanup

- [ ] **3.1** Remove dead code from StaffSelectionPage
  - Delete unused `@keyframes modalPop` CSS

- [ ] **3.2** Run validation
  - `npm run check` passes (lint + types)
  - `npm run format` applied
  - Manual visual test of each modal

## Verification

- [ ] All modals open/close correctly
- [ ] Backdrop click dismisses modals (where applicable)
- [ ] Auto-close timers work on ErrorModal, SuccessModal
- [ ] Escape key closes modals
- [ ] No console errors or warnings
- [ ] SonarCloud quality gate passes
