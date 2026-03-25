import { useEffect, useRef, useState, useCallback } from 'react';

import { useUserStore } from '../store/userStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('IdleTimer');

/** Idle timeout in milliseconds (3 minutes). */
const IDLE_TIMEOUT_MS = 180_000;

/**
 * Tracks user activity (pointer, keyboard, RFID scans) and returns
 * whether the app is currently idle (no interaction for IDLE_TIMEOUT_MS).
 *
 * Resets immediately on any interaction.
 */
export function useIdleTimer(): { isDimmed: boolean; resetIdle: () => void } {
  const [isDimmed, setIsDimmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentScan = useUserStore(s => s.rfid.currentScan);

  const resetIdle = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Wake up immediately if dimmed
    setIsDimmed(false);

    timerRef.current = setTimeout(() => {
      logger.info('Screen entering idle dim');
      setIsDimmed(true);
    }, IDLE_TIMEOUT_MS);
  }, []);

  // DOM event listeners: pointer + keyboard
  useEffect(() => {
    const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown'];

    for (const evt of events) {
      document.addEventListener(evt, resetIdle, { passive: true });
    }

    // Start the initial timer
    resetIdle();

    return () => {
      for (const evt of events) {
        document.removeEventListener(evt, resetIdle);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetIdle]);

  // RFID scan resets idle too
  useEffect(() => {
    if (currentScan) {
      resetIdle();
    }
  }, [currentScan, resetIdle]);

  return { isDimmed, resetIdle };
}
