/**
 * Unified Modal System
 *
 * Three-layer architecture:
 * 1. ModalShell - Overlay/backdrop mechanics (z-index, auto-close, backdrop click)
 * 2. ModalCard - Presentation layer (icon, title, body, actions)
 * 3. Domain wrappers - Convenience APIs (ScanModal, ErrorModal, SuccessModal)
 *
 * @example
 * // Basic usage with shell and card
 * <ModalShell isOpen={isOpen} onClose={handleClose} autoCloseMs={3000}>
 *   <ModalCard
 *     tone="success"
 *     icon={faCheck}
 *     title="Success!"
 *     body="Operation completed."
 *   />
 * </ModalShell>
 *
 * // Or use domain-specific wrappers for simpler API
 * <ErrorModal isOpen={isOpen} onClose={handleClose} message="Something went wrong" />
 */

export { ModalShell, useModalShellTimer } from './ModalShell';
export { ModalCard } from './ModalCard';
export {
  type CloseReason,
  type ModalIcon,
  type ModalAction,
  type ModalTone,
  type ModalBackdropProps,
  type ModalShellProps,
  type ModalCardProps,
  MODAL_TONE_COLORS,
  SCAN_MODAL_COLORS,
} from './types';
