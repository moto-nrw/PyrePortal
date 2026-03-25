import { useIdleTimer } from '../hooks/useIdleTimer';

/**
 * Full-screen overlay that dims the display after a period of inactivity.
 * Clicking/tapping/scanning immediately wakes the screen.
 *
 * Renders a fixed dark overlay with a CSS opacity transition.
 * When dimmed, pointer-events are enabled so the click wakes it;
 * when not dimmed, pointer-events are disabled so it's invisible to interaction.
 */
export default function ScreenDimmer() {
  const { isDimmed } = useIdleTimer();

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        opacity: isDimmed ? 1 : 0,
        transition: isDimmed ? 'opacity 0.6s ease-in' : 'opacity 0.15s ease-out',
        pointerEvents: isDimmed ? 'auto' : 'none',
      }}
    />
  );
}
