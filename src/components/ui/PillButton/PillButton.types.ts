import type { ReactNode } from 'react';

export interface PillButtonProps {
  /** Button content (text) */
  children: ReactNode;

  /** Optional icon element (rendered left of the text) */
  icon?: ReactNode;

  /** Button variant - determines color scheme */
  variant: 'primary' | 'action' | 'secondary' | 'ghost';

  /** Color accent for the secondary and ghost variants */
  color?: 'blue' | 'gray';

  /** Disabled state */
  disabled?: boolean;

  /** Click handler */
  onClick: () => void;

  /** Accessible label for screen readers */
  ariaLabel?: string;
}
