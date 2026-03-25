import type { PointerEvent } from 'react';

/**
 * Returns onPointerDown/Up/Leave handlers that apply a scale(0.95) press effect.
 * Pass `disabled` to suppress the animation when the button is inactive.
 */
export const pressHandlers = (disabled?: boolean) => ({
  onPointerDown: (e: PointerEvent<HTMLElement>) => {
    if (!disabled) e.currentTarget.style.transform = 'scale(0.95)';
  },
  onPointerUp: (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.transform = '';
  },
  onPointerLeave: (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.transform = '';
  },
});
