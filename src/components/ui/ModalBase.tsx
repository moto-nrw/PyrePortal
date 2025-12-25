import type React from 'react';

import { useModalTimeout } from '../../hooks/useModalTimeout';

import { ModalTimeoutIndicator } from './ModalTimeoutIndicator';

interface ModalBaseProps {
  /** Controls modal visibility */
  isOpen: boolean;

  /** Called when modal should close (backdrop click or timeout) */
  onClose: () => void;

  /** Modal content */
  children: React.ReactNode;

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
export const ModalBase: React.FC<ModalBaseProps> = ({
  isOpen,
  onClose,
  children,
  backgroundColor = '#FFFFFF',
  timeout,
  showTimeoutIndicator = true,
  timeoutResetKey,
  onTimeout,
  closeOnBackdropClick = true,
}) => {
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

  // Handle backdrop click
  const handleBackdropClick = () => {
    if (closeOnBackdropClick) {
      onClose();
    }
  };

  // Don't render when closed
  if (!isOpen) {
    return null;
  }

  const shouldShowIndicator = showTimeoutIndicator && timeout !== undefined;

  return (
    // Backdrop
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleBackdropClick}
    >
      {/* Container */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          backgroundColor,
          borderRadius: '32px',
          padding: '64px',
          maxWidth: '700px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
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
    </div>
  );
};
