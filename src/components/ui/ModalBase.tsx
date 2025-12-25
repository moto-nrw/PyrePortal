import { useEffect, useRef, type ReactNode } from 'react';

import { useModalTimeout } from '../../hooks/useModalTimeout';

import { ModalTimeoutIndicator } from './ModalTimeoutIndicator';

/** Modal size preset */
export type ModalSize = 'sm' | 'md' | 'lg';

/** Size preset configurations matching existing modal dimensions */
const SIZE_PRESETS = {
  sm: { maxWidth: '500px', padding: '48px', borderRadius: '20px' }, // ErrorModal, SuccessModal, InfoModal
  md: { maxWidth: '600px', padding: '56px', borderRadius: '24px' }, // Future use
  lg: { maxWidth: '700px', padding: '64px', borderRadius: '32px' }, // ActivityScanningPage (current default)
} as const;

/**
 * Determines if a background color is light (needs dark indicator).
 * Uses simple heuristic for white/near-white colors.
 */
const isLightBackground = (bg: string): boolean => {
  const normalized = bg.toLowerCase().trim();
  return (
    normalized === '#ffffff' ||
    normalized === '#fff' ||
    normalized === 'white' ||
    normalized.startsWith('rgba(255, 255, 255') ||
    normalized.startsWith('rgba(255,255,255')
  );
};

/**
 * Returns appropriate timeout indicator colors based on background.
 * Light backgrounds get dark indicators; dark backgrounds get light indicators.
 */
const getContrastColors = (bg: string): { color: string; trackColor: string } => {
  return isLightBackground(bg)
    ? { color: 'rgba(0, 0, 0, 0.3)', trackColor: 'rgba(0, 0, 0, 0.1)' }
    : { color: 'rgba(255, 255, 255, 0.9)', trackColor: 'rgba(255, 255, 255, 0.2)' };
};

interface ModalBaseProps {
  /** Controls modal visibility */
  isOpen: boolean;

  /** Called when modal should close (backdrop click or timeout) */
  onClose: () => void;

  /** Modal content */
  children: ReactNode;

  // --- Visual Customization ---

  /** Modal size preset. Default: 'lg' (backwards compatible) */
  size?: ModalSize;

  /** Background color of the modal container. Default: white */
  backgroundColor?: string;

  /** Backdrop blur amount. Default: '4px' */
  backdropBlur?: string;

  // --- Timeout ---

  /** Auto-close timeout in ms. Undefined = no auto-close */
  timeout?: number;

  /** Show the timeout progress indicator. Default: true when timeout is set */
  showTimeoutIndicator?: boolean;

  /** Key that resets the timeout when changed (e.g., scan ID) */
  timeoutResetKey?: string | number | null;

  /** Called when timeout expires (before onClose) */
  onTimeout?: () => void;

  /** Timeout indicator bar color. Default: determined by background contrast */
  timeoutColor?: string;

  /** Timeout indicator track color. Default: determined by background contrast */
  timeoutTrackColor?: string;

  // --- Behavior ---

  /** Allow closing by clicking backdrop. Default: true */
  closeOnBackdropClick?: boolean;
}

/**
 * Unified base modal component for consistent modal UX.
 *
 * Features:
 * - Uses native <dialog> element for proper accessibility
 * - Size presets: sm (500px), md (600px), lg (700px - default)
 * - Default backdrop blur (4px) with optional customization
 * - Integrated timeout system with visual indicator
 * - Auto-contrast timeout indicator (dark on light backgrounds)
 * - Configurable backdrop click dismissal
 *
 * @example
 * <ModalBase
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   size="sm"
 *   backgroundColor="#FFFFFF"
 *   timeout={3000}
 * >
 *   <h2>Modal Content</h2>
 * </ModalBase>
 */
export function ModalBase({
  isOpen,
  onClose,
  children,
  size = 'lg',
  backgroundColor = '#FFFFFF',
  backdropBlur,
  timeout,
  showTimeoutIndicator = true,
  timeoutResetKey,
  onTimeout,
  timeoutColor,
  timeoutTrackColor,
  closeOnBackdropClick = true,
}: Readonly<ModalBaseProps>) {
  // Get size preset values
  const sizePreset = SIZE_PRESETS[size];

  // Compute indicator colors based on background contrast
  const contrastColors = getContrastColors(backgroundColor);
  const indicatorColor = timeoutColor ?? contrastColors.color;
  const indicatorTrackColor = timeoutTrackColor ?? contrastColors.trackColor;
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

  // Build dialog style with optional backdrop blur override
  const dialogStyle: React.CSSProperties & { '--modal-backdrop-blur'?: string } = {
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
  };

  // Only set custom property when backdropBlur is explicitly provided
  if (backdropBlur !== undefined) {
    dialogStyle['--modal-backdrop-blur'] = `blur(${backdropBlur})`;
  }

  return (
    <dialog ref={dialogRef} style={dialogStyle}>
      {/* Container */}
      <div
        style={{
          backgroundColor,
          borderRadius: sizePreset.borderRadius,
          padding: sizePreset.padding,
          maxWidth: sizePreset.maxWidth,
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
            color={indicatorColor}
            trackColor={indicatorTrackColor}
            borderRadius={sizePreset.borderRadius}
          />
        )}
      </div>
    </dialog>
  );
}
