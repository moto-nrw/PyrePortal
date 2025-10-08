import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

export interface NetworkStatusData {
  isOnline: boolean;
  responseTime: number;
  lastChecked: number;
  quality: 'excellent' | 'good' | 'poor' | 'offline';
}

interface NetworkStatusProps {
  status: NetworkStatusData;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

/**
 * Network status indicator component with WiFi signal strength visualization
 */
const NetworkStatus: React.FC<NetworkStatusProps> = ({ status, size = 'md', showText = false }) => {
  // Determine icon style based on network quality
  const getIconStyle = () => {
    const baseStyle = {
      transition: 'color 0.3s ease',
    };

    switch (status.quality) {
      case 'excellent':
        return { ...baseStyle, color: '#10B981' }; // Green
      case 'good':
        return { ...baseStyle, color: '#F59E0B' }; // Amber
      case 'poor':
        return { ...baseStyle, color: '#EF4444' }; // Red
      case 'offline':
        return { ...baseStyle, color: '#6B7280', opacity: 0.5 }; // Gray
      default:
        return baseStyle;
    }
  };

  // Size mapping for FontAwesome
  const sizeMap = {
    sm: 'sm' as const,
    md: 'lg' as const,
    lg: '2x' as const,
  };

  // Text description
  const getStatusText = () => {
    if (!status.isOnline) return 'Offline';

    switch (status.quality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'poor':
        return 'Poor';
      default:
        return 'Unknown';
    }
  };

  // Container styles
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    backdropFilter: 'blur(4px)',
  };

  const textStyle = {
    fontSize: size === 'sm' ? '12px' : size === 'md' ? '14px' : '16px',
    fontWeight: '500',
    color: '#374151',
  };

  return (
    <div style={containerStyle} title={`Network ${getStatusText()} - ${status.responseTime}ms`}>
      <FontAwesomeIcon icon={faWifi} size={sizeMap[size]} style={getIconStyle()} />
      {showText && <span style={textStyle}>{getStatusText()}</span>}
    </div>
  );
};

export default NetworkStatus;
