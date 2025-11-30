import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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
 * Default text is "Zurück" with left chevron icon
 */
const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  text = 'Zurück',
  variant = 'outline',
  size = 'medium',
}) => {
  return (
    <Button onClick={onClick} variant={variant} size={size}>
      <FontAwesomeIcon icon={faChevronLeft} style={{ marginRight: '6px' }} />
      {text}
    </Button>
  );
};

export default BackButton;
