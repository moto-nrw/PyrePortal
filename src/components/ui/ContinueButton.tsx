import type { CSSProperties, ReactNode, TouchEvent } from 'react';

import { designSystem } from '../../styles/designSystem';

interface ContinueButtonProps {
  /** Click handler for the button action */
  onClick: () => void;

  /** Whether the button is disabled (grays out, removes touch feedback) */
  disabled?: boolean;

  /** Button text content. Default: "Weiter" */
  children?: ReactNode;

  /** Optional additional inline styles */
  style?: CSSProperties;
}

/**
 * Primary "Continue" action button with green gradient styling.
 * Designed for Raspberry Pi touch interface with proper touch feedback.
 * Default text: "Weiter"
 */
export function ContinueButton({
  onClick,
  disabled = false,
  children = 'Weiter',
  style,
}: Readonly<ContinueButtonProps>) {
  const handleTouchStart = (e: TouchEvent<HTMLButtonElement>) => {
    if (!disabled) {
      e.currentTarget.style.transform = designSystem.scales.active;
      e.currentTarget.style.boxShadow = designSystem.shadows.button;
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
    if (!disabled) {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = designSystem.shadows.green;
    }
  };

  const buttonStyles: CSSProperties = {
    // Layout - explicit flexbox centering
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',

    // Dimensions
    height: '68px',
    padding: '0 52px',

    // Typography
    fontSize: '26px',
    fontWeight: 600,
    color: '#FFFFFF',

    // Background
    background: disabled
      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
      : designSystem.gradients.greenRight,

    // Border
    border: 'none',
    borderRadius: designSystem.borderRadius.full,

    // Interaction
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',

    // Effects
    transition: designSystem.transitions.base,
    boxShadow: disabled ? 'none' : designSystem.shadows.green,
    opacity: disabled ? 0.6 : 1,

    // Allow style override
    ...style,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={buttonStyles}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
    </button>
  );
}

export default ContinueButton;
