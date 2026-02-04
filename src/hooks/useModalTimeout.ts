import { useEffect, useRef, useCallback, useState } from 'react';

interface UseModalTimeoutOptions {
  /** Timeout duration in milliseconds */
  duration: number;
  /** Whether the timeout is currently active */
  isActive: boolean;
  /** Callback when timeout expires */
  onTimeout: () => void;
  /** Optional key that triggers a reset when changed (e.g., scan ID) */
  resetKey?: string | number | null;
}

interface UseModalTimeoutReturn {
  /** Key for resetting CSS animations - use as component key prop */
  animationKey: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Manually reset the timer */
  reset: () => void;
}

/**
 * Hook for managing modal auto-dismiss timeouts with visual progress support.
 *
 * Features:
 * - Automatic reset when resetKey changes (e.g., new RFID scan)
 * - Clean timeout handling with proper cleanup
 * - Returns animationKey for syncing CSS animations
 *
 * @example
 * const { animationKey, isRunning } = useModalTimeout({
 *   duration: 7000,
 *   isActive: showModal,
 *   onTimeout: () => closeModal(),
 *   resetKey: currentScan?.tagId,
 * });
 *
 * <ModalTimeoutIndicator
 *   key={animationKey}
 *   duration={7000}
 *   isActive={isRunning}
 * />
 */
export function useModalTimeout({
  duration,
  isActive,
  onTimeout,
  resetKey,
}: UseModalTimeoutOptions): UseModalTimeoutReturn {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Stable callback ref to avoid stale closures
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  // Clear any existing timeout
  const clearCurrentTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Start a new timeout
  const startTimeout = useCallback(() => {
    clearCurrentTimeout();

    setIsRunning(true);
    setAnimationKey(prev => prev + 1);

    timeoutRef.current = setTimeout(() => {
      setIsRunning(false);
      timeoutRef.current = null;
      onTimeoutRef.current();
    }, duration);
  }, [clearCurrentTimeout, duration, resetKey]);

  // Manual reset function
  const reset = useCallback(() => {
    if (isActive) {
      startTimeout();
    }
  }, [isActive, startTimeout]);

  // Main effect: Start/stop timeout based on isActive
  useEffect(() => {
    if (isActive) {
      startTimeout();
    } else {
      clearCurrentTimeout();
      setIsRunning(false);
    }

    return clearCurrentTimeout;
  }, [isActive, startTimeout, clearCurrentTimeout]);

  // Reset effect: Restart timeout when resetKey changes (while active)
  useEffect(() => {
    if (isActive && resetKey !== undefined && resetKey !== null) {
      startTimeout();
    }
    // Only react to resetKey changes, not startTimeout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return { animationKey, isRunning, reset };
}
