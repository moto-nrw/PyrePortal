import type { ReactNode } from 'react';

import { PillButton } from './PillButton';

interface ContinueButtonProps {
  /** Click handler for the button action */
  onClick: () => void;
  /** Whether the button is disabled (grays out, removes touch feedback) */
  disabled?: boolean;
  /** Button text content. Default: "Weiter" */
  children?: ReactNode;
}

/**
 * Primary "Continue" action button with green gradient styling.
 * Thin wrapper around PillButton with primary variant.
 */
export function ContinueButton({
  onClick,
  disabled = false,
  children = 'Weiter',
}: Readonly<ContinueButtonProps>) {
  return (
    <PillButton variant="primary" onClick={onClick} disabled={disabled}>
      {children}
    </PillButton>
  );
}

export default ContinueButton;
