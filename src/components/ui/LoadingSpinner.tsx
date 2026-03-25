import { memo } from 'react';

interface LoadingSpinnerProps {
  /** Container min height (default: 400px) */
  readonly minHeight?: string;
  /** Spinner size in px (default: 48) */
  readonly size?: number;
}

/**
 * Centered gradient ring loading spinner.
 * Uses brand colors (blue → green) conic gradient with mask.
 */
export const LoadingSpinner = memo(function LoadingSpinner({
  minHeight = '400px',
  size = 48,
}: LoadingSpinnerProps) {
  const thickness = Math.max(3, Math.round(size * 0.08));

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
      }}
    >
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0%, #5080D8 50%, #83CD2D 100%)',
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  );
});

/**
 * CSS keyframes for spin animation.
 * Include this once in the page component.
 */
export const SpinKeyframes = () => (
  <style>
    {`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}
  </style>
);
