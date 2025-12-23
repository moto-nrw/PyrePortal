import type { ReactNode } from 'react';
import React from 'react';

import { designSystem } from '../../styles/designSystem';

/** Default back arrow icon */
const BackArrowIcon = ({ stroke }: { stroke: string }) => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </svg>
);

/** Restart/refresh icon */
const RestartIcon = ({ stroke }: { stroke: string }) => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

interface BackButtonProps {
  onClick: () => void;
  text?: string;
  /** Icon and text color - defaults to gray (#374151), use 'blue' for primary blue */
  color?: 'gray' | 'blue';
  /** Icon type - 'back' for back arrow (default), 'restart' for restart icon */
  icon?: 'back' | 'restart';
  /** Custom icon element - overrides the icon prop if provided */
  customIcon?: ReactNode;
  /** Accessible label for screen readers - defaults to text prop value */
  ariaLabel?: string;
}

/**
 * Reusable pill button component with glassmorphism styling
 * Uses designSystem.components.backButton for consistent appearance
 * Default text is "Zurück" with left arrow icon
 */
const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  text = 'Zurück',
  color = 'gray',
  icon = 'back',
  customIcon,
  ariaLabel,
}) => {
  const strokeColor = color === 'blue' ? '#5080d8' : '#374151';
  const textColor = color === 'blue' ? '#5080d8' : '#374151';
  const borderColor = color === 'blue' ? 'rgba(80, 128, 216, 0.2)' : 'rgba(0, 0, 0, 0.1)';

  const renderIcon = () => {
    if (customIcon) return customIcon;
    if (icon === 'restart') return <RestartIcon stroke={strokeColor} />;
    return <BackArrowIcon stroke={strokeColor} />;
  };

  /** Reset button to default visual state after touch interaction */
  const resetTouchStyles = (target: HTMLButtonElement) => {
    setTimeout(() => {
      if (target) {
        target.style.transform = 'scale(1)';
        target.style.backgroundColor = designSystem.glass.background;
        target.style.boxShadow = designSystem.shadows.button;
      }
    }, 150);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? text}
      style={{
        ...designSystem.components.backButton,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        cursor: 'pointer',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        overflow: 'hidden',
      }}
      onTouchStart={e => {
        e.currentTarget.style.transform = designSystem.scales.activeSmall;
        e.currentTarget.style.backgroundColor =
          color === 'blue' ? 'rgba(80, 128, 216, 0.1)' : 'rgba(249, 250, 251, 0.95)';
        e.currentTarget.style.boxShadow = designSystem.shadows.button;
      }}
      onTouchEnd={e => {
        // Capture target synchronously - currentTarget becomes null after handler returns
        const target = e.currentTarget;
        resetTouchStyles(target);
      }}
      onTouchCancel={e => {
        // Handle system interruptions (e.g., app switch, screen rotation, palm rejection)
        const target = e.currentTarget;
        resetTouchStyles(target);
      }}
    >
      {renderIcon()}
      <span
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: textColor,
        }}
      >
        {text}
      </span>
    </button>
  );
};

export default BackButton;
