import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ModalTimeoutIndicator } from '../ModalTimeoutIndicator';

import type { ModalShellProps } from './types';

/**
 * ModalShell - Overlay/backdrop mechanics layer for modals.
 *
 * Handles:
 * - Fixed positioning with backdrop overlay
 * - Click-outside to close (configurable)
 * - Escape key to close (configurable)
 * - Auto-close timing with optional progress indicator
 * - Standardized z-index (9999)
 *
 * @example
 * <ModalShell
 *   isOpen={showModal}
 *   onClose={(reason) => setShowModal(false)}
 *   autoCloseMs={3000}
 *   backdropBlur="4px"
 * >
 *   <ModalCard title="Success!" tone="success" />
 * </ModalShell>
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  autoCloseMs,
  children,
  zIndex = 9999,
  backdropOpacity = 0.7,
  backdropBlur,
  closeOnBackdropClick = true,
  closeOnEscape = false,
  timerResetKey,
  showProgress = false,
  progressDuration,
}) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Clear any existing timeout
  const clearAutoCloseTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Start auto-close timer
  const startAutoCloseTimer = useCallback(() => {
    if (!autoCloseMs) return;

    clearAutoCloseTimeout();
    setIsTimerRunning(true);
    setAnimationKey(prev => prev + 1);

    timeoutRef.current = setTimeout(() => {
      setIsTimerRunning(false);
      timeoutRef.current = null;
      onClose('timeout');
    }, autoCloseMs);
  }, [autoCloseMs, clearAutoCloseTimeout, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && closeOnBackdropClick) {
        onClose('backdrop');
      }
    },
    [closeOnBackdropClick, onClose]
  );

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose('escape');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Start/stop auto-close timer based on isOpen
  useEffect(() => {
    if (isOpen && autoCloseMs) {
      startAutoCloseTimer();
    } else {
      clearAutoCloseTimeout();
      setIsTimerRunning(false);
    }

    return clearAutoCloseTimeout;
  }, [isOpen, autoCloseMs, startAutoCloseTimer, clearAutoCloseTimeout]);

  // Reset timer when timerResetKey changes
  useEffect(() => {
    if (isOpen && autoCloseMs && timerResetKey !== undefined) {
      startAutoCloseTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerResetKey]);

  if (!isOpen) return null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex,
    ...(backdropBlur && {
      backdropFilter: `blur(${backdropBlur})`,
      WebkitBackdropFilter: `blur(${backdropBlur})`,
    }),
  };

  const effectiveDuration = progressDuration ?? autoCloseMs ?? 0;

  return (
    <div style={backdropStyle} onClick={handleBackdropClick} aria-modal="true" role="dialog">
      {children}

      {/* Progress indicator for timed modals */}
      {showProgress && autoCloseMs && (
        <ModalTimeoutIndicator
          key={animationKey}
          duration={effectiveDuration}
          isActive={isTimerRunning}
          position="bottom"
          height={8}
        />
      )}
    </div>
  );
};

/**
 * Hook for using ModalShell with externally controlled timer.
 * Useful when the parent component needs to reset the timer on state changes.
 */
export function useModalShellTimer(autoCloseMs: number | undefined, isActive: boolean) {
  const [animationKey, setAnimationKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const reset = useCallback(() => {
    setAnimationKey(prev => prev + 1);
    setIsRunning(true);
  }, []);

  useEffect(() => {
    if (isActive && autoCloseMs) {
      setIsRunning(true);
      setAnimationKey(prev => prev + 1);
    } else {
      setIsRunning(false);
    }
  }, [isActive, autoCloseMs]);

  return { animationKey, isRunning, reset };
}
