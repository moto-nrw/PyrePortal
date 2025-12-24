import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, isValidElement } from 'react';

import { ModalTimeoutIndicator } from '../ModalTimeoutIndicator';

import { MODAL_TONE_COLORS, type ModalCardProps, type ModalAction } from './types';

/**
 * ModalCard - Presentation layer for modals.
 *
 * Handles:
 * - Icon display (FontAwesome or custom ReactNode)
 * - Title and body content
 * - Action buttons with consistent styling
 * - Tone-based color schemes with custom overrides
 * - Optional progress indicator integration
 *
 * @example
 * <ModalCard
 *   tone="success"
 *   icon={faCheckCircle}
 *   title="Success!"
 *   body="Your action was completed."
 *   actions={[{ label: 'OK', onClick: handleClose, closesModal: true }]}
 * />
 */
export const ModalCard: React.FC<ModalCardProps> = ({
  tone = 'info',
  customPrimaryColor,
  customBackgroundColor,
  icon,
  title,
  body,
  actions,
  children,
  animation = 'none',
  width = '90%',
  maxWidth = '700px',
  borderRadius = '32px',
  padding = '64px',
  stopPropagation = true,
  progressIndicator,
}) => {
  // Resolve colors: custom overrides take precedence over tone
  const toneColors = MODAL_TONE_COLORS[tone];
  const primaryColor = customPrimaryColor ?? toneColors.primary;
  const backgroundColor = customBackgroundColor ?? toneColors.background;

  // Animation class/style based on animation prop
  const getAnimationStyle = (): React.CSSProperties => {
    switch (animation) {
      case 'pop':
        return { animation: 'modalPop 300ms ease-out' };
      case 'slideIn':
        return { animation: 'modalSlideIn 300ms ease-out' };
      case 'fadeIn':
        return { animation: 'fadeIn 200ms ease-out' };
      default:
        return {};
    }
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor,
    borderRadius,
    padding,
    width,
    maxWidth,
    textAlign: 'center',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
    position: 'relative',
    overflow: 'hidden',
    ...getAnimationStyle(),
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  return (
    <div style={cardStyle} onClick={handleCardClick}>
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

      {/* Icon */}
      {icon && <ModalIcon icon={icon} />}

      {/* Title */}
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
        {title}
      </h2>

      {/* Body content or children */}
      {children ? (
        <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
      ) : (
        <>
          {body && (
            <div
              style={{
                fontSize: '28px',
                color: 'rgba(255, 255, 255, 0.95)',
                fontWeight: 600,
                position: 'relative',
                zIndex: 2,
                marginBottom: actions?.length ? '32px' : 0,
              }}
            >
              {body}
            </div>
          )}

          {/* Action buttons */}
          {actions && actions.length > 0 && (
            <ModalActions actions={actions} primaryColor={primaryColor} />
          )}
        </>
      )}

      {/* Progress indicator (when controlled externally) */}
      {progressIndicator && (
        <ModalTimeoutIndicator
          key={progressIndicator.animationKey}
          duration={progressIndicator.duration}
          isActive={progressIndicator.isActive}
          position="bottom"
          height={8}
        />
      )}
    </div>
  );
};

/**
 * Icon component that handles both FontAwesome icons and custom ReactNodes.
 */
const ModalIcon: React.FC<{ icon: ModalCardProps['icon'] }> = ({ icon }) => {
  const containerStyle: React.CSSProperties = {
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
  };

  // Check if it's a FontAwesome icon definition
  const isFontAwesomeIcon = (i: unknown): i is IconDefinition => {
    return typeof i === 'object' && i !== null && 'icon' in i && 'iconName' in i && 'prefix' in i;
  };

  if (isFontAwesomeIcon(icon)) {
    return (
      <div style={containerStyle}>
        <FontAwesomeIcon
          icon={icon}
          style={{ color: '#FFFFFF', fontSize: '64px', width: '80px', height: '80px' }}
        />
      </div>
    );
  }

  // It's a ReactNode (e.g., custom SVG)
  if (isValidElement(icon)) {
    return <div style={containerStyle}>{icon}</div>;
  }

  // Fallback for other ReactNode types
  return <div style={containerStyle}>{icon}</div>;
};

/**
 * Action buttons component with consistent styling.
 */
const ModalActions: React.FC<{ actions: ModalAction[]; primaryColor: string }> = ({
  actions,
  primaryColor,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 2,
      }}
    >
      {actions.map((action, index) => (
        <ActionButton key={index} action={action} primaryColor={primaryColor} />
      ))}
    </div>
  );
};

/**
 * Individual action button with hover state handling.
 */
const ActionButton: React.FC<{ action: ModalAction; primaryColor: string }> = ({
  action,
  primaryColor: _primaryColor,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getBaseStyle = (): React.CSSProperties => {
    switch (action.variant) {
      case 'primary':
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.25)',
          border: '3px solid rgba(255, 255, 255, 0.5)',
          color: '#FFFFFF',
        };
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          border: '2px solid rgba(255, 255, 255, 0.4)',
          color: 'rgba(255, 255, 255, 0.9)',
        };
      case 'danger':
        return {
          backgroundColor: 'rgba(239, 68, 68, 0.3)',
          border: '3px solid rgba(239, 68, 68, 0.7)',
          color: '#FFFFFF',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.8)',
        };
      default:
        // Default to primary-like style
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.25)',
          border: '3px solid rgba(255, 255, 255, 0.5)',
          color: '#FFFFFF',
        };
    }
  };

  const getHoverStyle = (): React.CSSProperties => {
    switch (action.variant) {
      case 'primary':
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.35)',
          transform: 'scale(1.05)',
        };
      case 'secondary':
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          borderColor: 'rgba(255, 255, 255, 0.6)',
        };
      case 'danger':
        return {
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          transform: 'scale(1.05)',
        };
      case 'ghost':
        return {
          color: '#FFFFFF',
        };
      default:
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.35)',
          transform: 'scale(1.05)',
        };
    }
  };

  const baseStyle = getBaseStyle();
  const hoverStyle = getHoverStyle();

  const buttonStyle: React.CSSProperties = {
    borderRadius: '20px',
    fontSize: '24px',
    fontWeight: 700,
    padding: '16px 48px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    ...baseStyle,
    ...(action.style ?? {}),
    ...(isHovered ? { ...hoverStyle, ...(action.hoverStyle ?? {}) } : {}),
  };

  return (
    <button
      onClick={action.onClick}
      style={buttonStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {action.label}
    </button>
  );
};
