import type { CSSProperties, TouchEvent } from 'react';

import { designSystem } from '../../../styles/designSystem';

import type { PillButtonProps } from './PillButton.types';

/** Variant-specific styling configuration */
const variantStyles = {
  primary: {
    background: designSystem.gradients.greenRight,
    color: '#FFFFFF',
    fontSize: '26px',
    padding: '0 52px',
    shadow: designSystem.shadows.green,
    border: 'none',
  },
  action: {
    background: designSystem.gradients.blueRight,
    color: '#FFFFFF',
    fontSize: '26px',
    padding: '0 52px',
    shadow: designSystem.shadows.blue,
    border: 'none',
  },
  secondary: {
    background: designSystem.glass.background,
    color: '#374151', // Default gray, overridden by colorStyle
    fontSize: '20px',
    padding: '0 32px',
    shadow: designSystem.shadows.button,
    border: '1px solid rgba(0, 0, 0, 0.1)', // Default, overridden by colorStyle
  },
};

/** Color-specific styling for secondary variant */
const secondaryColors = {
  gray: {
    color: '#374151',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    touchBackground: '#F9FAFB',
  },
  blue: {
    color: '#5080D8',
    border: '1px solid rgba(80, 128, 216, 0.2)',
    touchBackground: 'rgba(80, 128, 216, 0.1)',
  },
};

/**
 * Unified pill button component with three variants.
 * - primary: Green gradient for confirmations (Weiter, Speichern)
 * - action: Blue gradient for actions (Scan starten)
 * - secondary: Glass effect for navigation (Zurück)
 */
export function PillButton({
  children,
  icon,
  iconPosition = 'left',
  variant,
  color = 'gray',
  disabled = false,
  onClick,
  ariaLabel,
}: Readonly<PillButtonProps>) {
  const vstyle = variantStyles[variant];
  const colorStyle = variant === 'secondary' ? secondaryColors[color] : null;

  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: '68px',
    padding: vstyle.padding,
    fontSize: vstyle.fontSize,
    fontWeight: 600,
    color: colorStyle?.color ?? vstyle.color,
    background: disabled ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)' : vstyle.background,
    border: colorStyle?.border ?? vstyle.border,
    borderRadius: '34px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: designSystem.transitions.base,
    boxShadow: disabled ? 'none' : vstyle.shadow,
    opacity: disabled ? 0.6 : 1,
    ...(variant === 'secondary' && {
      backdropFilter: designSystem.glass.blur,
      WebkitBackdropFilter: designSystem.glass.blur,
    }),
  };

  const handleTouchStart = (e: TouchEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.style.transform = designSystem.scales.activeSmall;
    e.currentTarget.style.boxShadow = designSystem.shadows.button;
    if (variant === 'secondary' && colorStyle) {
      e.currentTarget.style.backgroundColor = colorStyle.touchBackground;
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const target = e.currentTarget;
    setTimeout(() => {
      target.style.transform = 'scale(1)';
      target.style.boxShadow = vstyle.shadow;
      if (variant === 'secondary') {
        target.style.backgroundColor = designSystem.glass.background;
      }
    }, 150);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={baseStyle}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {icon && iconPosition === 'left' && icon}
      <span>{children}</span>
      {icon && iconPosition === 'right' && icon}
    </button>
  );
}

export default PillButton;
