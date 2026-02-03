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
            border: '4px solid rgba(80, 128, 216, 0.2)',
            borderTopColor: '#5080D8',
            borderRadius: '50%',
            animation: 'rfid-processing-spin 0.8s linear infinite',
          }}
        />
      </div>
    </>
  );
});

export default RfidProcessingIndicator;
