import React, { useEffect } from 'react';

import { useUserStore } from '../store/userStore';

import { ModalBase } from './ui';

// CSS keyframes for pending scan animations
const PENDING_SCAN_KEYFRAMES = `
@keyframes pending-scan-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.8;
  }
}
`;

/**
 * PendingScanModal - Shows "Armband erkannt..." feedback while API processes
 *
 * This component is self-contained and reads directly from the store.
 * It automatically shows when activePendingScan is set (after 300ms delay)
 * and hides when clearPendingScan() is called (when API returns).
 *
 * Usage: Simply render <PendingScanModal /> in any page that uses RFID scanning.
 * The component handles its own visibility based on store state.
 */
export const PendingScanModal: React.FC = () => {
  const activePendingScan = useUserStore(state => state.rfid.activePendingScan);
  const showModal = useUserStore(state => state.rfid.showModal);

  // Inject keyframes into document head (with cleanup)
  useEffect(() => {
    const styleId = 'pending-scan-keyframes';
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = PENDING_SCAN_KEYFRAMES;
      document.head.appendChild(styleElement);
    }
    return () => {
      const existing = document.getElementById(styleId);
      if (existing) {
        existing.remove();
      }
    };
  }, []);

  // Don't render if no pending scan
  if (!activePendingScan) {
    return null;
  }

  return (
    <ModalBase
      isOpen={showModal && !!activePendingScan}
      onClose={() => {
        /* No auto-close - transitions to result or clears on API response */
      }}
      backgroundColor="#3B82F6"
    >
      {/* Background pattern for visual interest */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Icon container with pulse animation */}
      <div
        style={{
          width: '120px',
          height: '120px',
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 32px',
          position: 'relative',
          zIndex: 2,
          animation: 'pending-scan-pulse 1s ease-in-out infinite',
        }}
      >
        {/* RFID signal icon */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
          <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
          <path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
          <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: '48px',
          fontWeight: 800,
          marginBottom: '24px',
          color: '#FFFFFF',
          lineHeight: 1.2,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Armband erkannt...
      </h2>

      <div
        style={{
          fontSize: '28px',
          color: 'rgba(255, 255, 255, 0.95)',
          fontWeight: 600,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Daten werden geladen
      </div>
    </ModalBase>
  );
};

export default PendingScanModal;
