import { designSystem } from '../styles/designSystem';

/**
 * Static dotted page background (Florian / phoenix design system).
 *
 * Replaces the previous blurred bubble canvas. Keeps the same component name
 * and API so all pages that render it through BackgroundWrapper stay unchanged.
 */
export function AnimatedBackground() {
  return (
    <div
      className="fixed inset-0 h-full w-full"
      style={{
        zIndex: -10,
        backgroundColor: designSystem.dottedBackground.base,
        backgroundImage: designSystem.dottedBackground.image,
        backgroundSize: designSystem.dottedBackground.size,
      }}
    />
  );
}
