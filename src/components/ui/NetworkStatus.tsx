import { faWifi, faSlash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

export interface NetworkStatusData {
  isOnline: boolean;
  responseTime: number;
  lastChecked: number;
  quality: 'online' | 'poor' | 'offline';
}

interface NetworkStatusProps {
  status: NetworkStatusData;
}

/**
 * Network status indicator component - only shows when poor or offline
 * Displays in bottom-right corner with prominent red warning icon
 */
const NetworkStatus: React.FC<NetworkStatusProps> = ({ status }) => {
  // Only render for poor or offline states (not when online)
  if (status.quality === 'online') {
    return null;
  }

  const isOffline = status.quality === 'offline';

  // Container styles - transparent, just positions the icon
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
  };

  // Icon wrapper for stacking (offline only)
  const iconWrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  // Red color with pulse animation for both states
  const wifiIconStyle = {
    color: '#EF4444',
    animation: 'pulse-scale 2s ease-in-out infinite',
    opacity: isOffline ? 0.4 : 1, // Dimmed for offline to show it's not working
  } as const;

  // Slash overlay for offline state
  const slashStyle = {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#EF4444',
  };

  return (
    <>
      {/* Add keyframe animation for pulsing scale */}
      <style>{`
        @keyframes pulse-scale {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.15);
          }
        }
      `}</style>
      <div
        style={containerStyle}
        title={`Network ${isOffline ? 'Offline' : 'Poor Connection'} - ${status.responseTime}ms`}
      >
        <div style={iconWrapperStyle}>
          <FontAwesomeIcon icon={faWifi} size="3x" style={wifiIconStyle} />
          {isOffline && <FontAwesomeIcon icon={faSlash} size="3x" style={slashStyle} />}
        </div>
      </div>
    </>
  );
};

export default NetworkStatus;
