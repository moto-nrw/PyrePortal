import { memo } from 'react';

interface LoadingSpinnerProps {
  /** Spinner color (default: blue) */
  readonly color?: string;
  /** Container min height (default: 400px) */
  readonly minHeight?: string;
}

/**
 * Centered loading spinner with animation.
 * Used across selection pages during data fetching.
 */
export const LoadingSpinner = memo(function LoadingSpinner({
  color = '#5080D8',
  minHeight = '400px',
}: LoadingSpinnerProps) {
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
          width: '48px',
          height: '48px',
          border: '3px solid #E5E7EB',
          borderTopColor: color,
          borderRadius: '50%',
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
