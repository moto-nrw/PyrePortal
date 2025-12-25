import { useEffect, useRef, type ReactNode } from 'react';

import { useModalTimeout } from '../../hooks/useModalTimeout';

import { ModalTimeoutIndicator } from './ModalTimeoutIndicator';

interface ModalBaseProps {
  /** Controls modal visibility */
  isOpen: boolean;

  /** Called when modal should close (backdrop click or timeout) */
  onClose: () => void;

  /** Modal content */
  children: ReactNode;

  // --- Visual Customization ---

  /** Background color of the modal container. Default: white */
  backgroundColor?: string;

  // --- Timeout ---

  /** Auto-close timeout in ms. Undefined = no auto-close */
  timeout?: number;

  /** Show the timeout progress indicator. Default: true when timeout is set */
  showTimeoutIndicator?: boolean;

  /** Key that resets the timeout when changed (e.g., scan ID) */
  timeoutResetKey?: string | number | null;

  /** Called when timeout expires (before onClose) */
  onTimeout?: () => void;

  // --- Behavior ---

  /** Allow closing by clicking backdrop. Default: true */
  closeOnBackdropClick?: boolean;
}

/**
 * Unified base modal component extracted from ActivityScanningPage.
 *
 * Features:
 * - Uses native <dialog> element for proper accessibility
 * - Dark backdrop overlay (no blur)
 * - Consistent container styling (32px radius, 64px padding, 700px max-width)
 * - Integrated timeout system with visual indicator
 * - Configurable backdrop click dismissal
 *
 * @example
 * <ModalBase
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   backgroundColor="#83cd2d"
 *   timeout={7000}
 *   timeoutResetKey={scanId}
 * >
 *   <h2>Modal Content</h2>
 * </ModalBase>
 */
export function ModalBase({
  isOpen,
  onClose,
  children,
  backgroundColor = '#FFFFFF',
  timeout,
  showTimeoutIndicator = true,
  timeoutResetKey,
  onTimeout,
  closeOnBackdropClick = true,
}: Readonly<ModalBaseProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Handle timeout expiration
  const handleTimeoutExpired = () => {
    onTimeout?.();
    onClose();
  };

  // Modal timeout hook - manages timer and provides animation key for progress bar
  const { animationKey, isRunning } = useModalTimeout({
    duration: timeout ?? 0,
    isActive: isOpen && timeout !== undefined,
    onTimeout: handleTimeoutExpired,
    resetKey: timeoutResetKey,
  });

  // Sync dialog open state with isOpen prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle native dialog close event (e.g., Escape key)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      // Only call onClose if dialog was open (prevents double-call)
      if (isOpen) {
        onClose();
      }
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [isOpen, onClose]);

  // Handle backdrop click via native dialog click event
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !closeOnBackdropClick) return;

    const handleClick = (e: MouseEvent) => {
      // Check if click was on the backdrop (dialog element itself, not its children)
      if (e.target === dialog) {
        dialog.close();
      }
    };

    dialog.addEventListener('click', handleClick);
    return () => dialog.removeEventListener('click', handleClick);
  }, [closeOnBackdropClick]);

  const shouldShowIndicator = showTimeoutIndicator && timeout !== undefined;

  return (
    <dialog
      ref={dialogRef}
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        padding: 0,
        maxWidth: 'none',
        maxHeight: 'none',
        overflow: 'visible',
        // Centering: native dialog needs explicit positioning when max-width/height are overridden
        position: 'fixed',
        inset: 0,
        margin: 'auto',
        // Remove default focus outline (dialog receives focus on showModal())
        outline: 'none',
      }}
    >
      {/* Container */}
      <div
        style={{
          backgroundColor,
          borderRadius: '32px',
          padding: '64px',
          maxWidth: '700px',
          width: '90vw',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {children}

        {/* Timeout progress indicator */}
        {shouldShowIndicator && (
          <ModalTimeoutIndicator
            key={animationKey}
            duration={timeout}
            isActive={isRunning}
            position="bottom"
            height={8}
          />
        )}
      </div>
    </dialog>
  );
}
