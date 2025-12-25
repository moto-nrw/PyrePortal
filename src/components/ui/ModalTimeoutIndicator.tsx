import React, { useEffect, useState } from 'react';

interface ModalTimeoutIndicatorProps {
  /** Timeout duration in milliseconds */
  duration: number;
  /** Whether the animation is active */
  isActive: boolean;
  /** Position of the indicator bar */
  position?: 'top' | 'bottom';
  /** Height of the bar in pixels */
  height?: number;
  /** Bar color (CSS color value) */
  color?: string;
  /** Background track color */
  trackColor?: string;
  /** Border radius of the modal container (for matching corners) */
  borderRadius?: string;
}

/**
 * Visual progress indicator for modal auto-dismiss timeouts.
 *
 * Uses pure CSS animation for smooth, GPU-accelerated 60fps performance.
 * Reset the animation by changing the component's key prop.
 *
 * @example
 * const { animationKey, isRunning } = useModalTimeout({...});
 *
 * <ModalTimeoutIndicator
 *   key={animationKey}
 *   duration={7000}
 *   isActive={isRunning}
 *   position="bottom"
 * />
 */
export const ModalTimeoutIndicator: React.FC<ModalTimeoutIndicatorProps> = ({
  duration,
  isActive,
  position = 'bottom',
  height = 6,
  color = 'rgba(255, 255, 255, 0.9)',
  trackColor = 'rgba(255, 255, 255, 0.2)',
  borderRadius = '32px',
}) => {
  // State to trigger animation after mount (avoids flash)
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Start animation after component mounts to ensure CSS transition works
  useEffect(() => {
    if (isActive) {
      // Use requestAnimationFrame to ensure the initial render completes
      // before starting the animation (fixes race condition)
      const rafId = requestAnimationFrame(() => {
        setShouldAnimate(true);
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      setShouldAnimate(false);
    }
  }, [isActive]);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    [position]: 0,
    left: 0,
    right: 0,
    height: `${height}px`,
    backgroundColor: trackColor,
    overflow: 'hidden',
    // Match modal border radius
    borderRadius:
      position === 'top'
        ? `${borderRadius} ${borderRadius} 0 0`
        : `0 0 ${borderRadius} ${borderRadius}`,
  };

  const barStyle: React.CSSProperties = {
    height: '100%',
    backgroundColor: color,
    // Start at 100%, animate to 0%
    width: shouldAnimate ? '0%' : '100%',
    // Linear transition over the full duration
    transition: shouldAnimate ? `width ${duration}ms linear` : 'none',
    // Add subtle glow effect
    boxShadow: `0 0 ${height}px ${color}`,
  };

  return (
    <div style={containerStyle}>
      <div style={barStyle} />
    </div>
  );
};
