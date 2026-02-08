import type { ReactNode } from 'react';

import { PillButton } from './PillButton';

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
  /** Disabled state - passed through to PillButton */
  disabled?: boolean;
}

/**
 * Navigation back button with glassmorphism styling.
 * Thin wrapper around PillButton with secondary variant.
 */
const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  text = 'Zurück',
  color = 'gray',
  icon = 'back',
  customIcon,
  ariaLabel,
  disabled,
}) => {
  const strokeColor = color === 'blue' ? '#5080d8' : '#374151';

  const renderIcon = () => {
    if (customIcon) return customIcon;
    if (icon === 'restart') return <RestartIcon stroke={strokeColor} />;
    return <BackArrowIcon stroke={strokeColor} />;
  };

  return (
    <PillButton
      variant="secondary"
      color={color}
      onClick={onClick}
      disabled={disabled}
      icon={renderIcon()}
      ariaLabel={ariaLabel ?? text}
    >
      {text}
    </PillButton>
  );
};

export default BackButton;
