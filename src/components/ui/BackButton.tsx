import React from 'react';

import Button from './Button';

interface BackButtonProps {
  onClick: () => void;
  text?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
}

/**
 * Reusable back button component with consistent styling
 * Default text is "← Zurück" but can be customized
 */
const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  text = '← Zurück',
  variant = 'outline',
  size = 'medium',
}) => {
  return (
    <Button onClick={onClick} variant={variant} size={size}>
      {text}
    </Button>
  );
};

export default BackButton;