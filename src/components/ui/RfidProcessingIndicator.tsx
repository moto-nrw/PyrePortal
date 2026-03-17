import { memo } from 'react';

interface RfidProcessingIndicatorProps {
  readonly isVisible: boolean;
}

/**
 * Fixed-position bottom-left spinner indicating an RFID scan is being processed by the API.
 * Mirrors the NetworkStatus indicator positioning (bottom-right) but on the opposite corner.
 * Shows between RFID tag detection (Rust backend) and API response.
 */
const RfidProcessingIndicator = memo(function RfidProcessingIndicator({
  isVisible,
}: RfidProcessingIndicatorProps) {
  if (!isVisible) return null;

  return (
    <>
      <style>{`
        @keyframes rfid-processing-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '8px',
          left: '8px',
          zIndex: 1000,
          pointerEvents: 'none',
          padding: '12px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 0%, #5080D8 50%, #83CD2D 100%)',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))',
            WebkitMask:
              'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))',
            animation: 'rfid-processing-spin 0.8s linear infinite',
          }}
        />
      </div>
    </>
  );
});

export default RfidProcessingIndicator;
