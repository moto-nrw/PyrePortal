import type { CSSProperties, PointerEvent } from 'react';

import { designSystem } from '../../../styles/designSystem';

import type { PillButtonProps } from './PillButton.types';

/** Variant-specific styling configuration (flat, Florian / phoenix palette) */
const variantStyles = {
  primary: {
    background: designSystem.flat.primary, // gray-900
    hoverBackground: designSystem.flat.primaryHover, // gray-800
    color: '#FFFFFF',
    fontSize: '26px',
    padding: '0 52px',
    shadow: designSystem.shadows.md,
    border: 'none',
  },
  action: {
    background: designSystem.flat.action, // blue
    hoverBackground: designSystem.flat.actionHover,
    color: '#FFFFFF',
    fontSize: '26px',
    padding: '0 52px',
    shadow: designSystem.shadows.md,
    border: 'none',
  },
  secondary: {
    background: '#FFFFFF',
    hoverBackground: designSystem.gray[50],
    color: designSystem.gray[700],
    fontSize: '20px',
    padding: '0 32px',
    shadow: designSystem.shadows.sm,
    border: `1px solid ${designSystem.gray[300]}`,
  },
  ghost: {
    background: 'transparent',
    hoverBackground: designSystem.gray[100],
    color: designSystem.gray[600],
    fontSize: '20px',
    padding: '0 32px',
    shadow: 'none',
    border: '1px solid transparent',
  },
};

/** Color-specific styling for secondary variant */
const secondaryColors = {
  gray: {
    color: designSystem.gray[700],
    border: `1px solid ${designSystem.gray[300]}`,
    touchBackground: designSystem.gray[50],
  },
  blue: {
    color: '#5080D8',
    border: '1px solid rgba(80, 128, 216, 0.3)',
    touchBackground: 'rgba(80, 128, 216, 0.1)',
  },
};

/**
 * Color-specific styling for the ghost variant (subtle, no border/shadow).
 * Resting text is muted; press/hover deepens the text and adds a faint tint.
 */
const ghostColors = {
  gray: {
    color: designSystem.gray[600],
    touchColor: designSystem.gray[900],
    touchBackground: designSystem.gray[100],
  },
  blue: {
    color: '#5080D8',
    touchColor: '#4A70C8',
    touchBackground: 'rgba(80, 128, 216, 0.1)',
  },
};

/**
 * Unified pill button component with three variants (flat phoenix design).
 * - primary: gray-900 for confirmations (Weiter, Speichern)
 * - action: brand blue for actions (Scan starten)
 * - secondary: white + gray border for navigation (Zurück)
 */
export function PillButton({
  children,
  icon,
  variant,
  color = 'gray',
  disabled = false,
  onClick,
  ariaLabel,
}: Readonly<PillButtonProps>) {
  const vstyle = variantStyles[variant];
  const colorStyle =
    variant === 'secondary'
      ? secondaryColors[color]
      : variant === 'ghost'
        ? ghostColors[color]
        : null;

  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: '68px',
    padding: vstyle.padding,
    fontSize: vstyle.fontSize,
    fontWeight: 500,
    color: colorStyle?.color ?? vstyle.color,
    background: disabled ? designSystem.gray[400] : vstyle.background,
    border: (colorStyle && 'border' in colorStyle ? colorStyle.border : undefined) ?? vstyle.border,
    borderRadius: '34px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',

    transition: designSystem.transitions.base,
    boxShadow: disabled ? 'none' : vstyle.shadow,
    opacity: disabled ? 0.6 : 1,
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.style.transform = designSystem.scales.activeSmall;
    if (variant === 'ghost') {
      const gc = ghostColors[color];
      e.currentTarget.style.backgroundColor = gc.touchBackground;
      e.currentTarget.style.color = gc.touchColor;
    } else if (variant === 'secondary' && colorStyle) {
      e.currentTarget.style.backgroundColor = colorStyle.touchBackground;
    } else {
      e.currentTarget.style.backgroundColor = vstyle.hoverBackground;
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.style.transform = '';
    e.currentTarget.style.backgroundColor = vstyle.background;
    if (variant === 'ghost') {
      e.currentTarget.style.color = ghostColors[color].color;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={baseStyle}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
