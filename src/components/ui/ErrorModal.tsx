import { faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useCallback } from 'react';

import theme from '../../styles/theme';

import { ModalShell } from './modal/index';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  autoCloseDelay?: number;
}

/**
 * ErrorModal - Displays error messages with auto-close.
 *
 * Refactored to use ModalShell for consistent backdrop behavior.
 * Preserves original API and styling.
 *
 * @example
 * <ErrorModal
 *   isOpen={showError}
 *   onClose={() => setShowError(false)}
 *   message="Something went wrong"
 *   autoCloseDelay={5000}
 * />
 */
export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  message,
  autoCloseDelay = 3000, // Default 3 seconds
}) => {
  // Wrap onClose to ignore the reason parameter (preserve original API)
  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      autoCloseMs={autoCloseDelay}
      backdropOpacity={0.5}
      closeOnBackdropClick={true}
      closeOnEscape={false}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.light,
          borderRadius: theme.borders.radius.lg,
          padding: theme.spacing.xxl,
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: theme.shadows.lg,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: theme.spacing.lg, color: '#DC2626' }}>
          <FontAwesomeIcon icon={faCircleXmark} style={{ fontSize: '3rem' }} />
        </div>
        <h2
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.primary,
          }}
        >
          Fehler
        </h2>
        <div
          style={{
            fontSize: theme.fonts.size.large,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
          }}
        >
          {message}
        </div>
      </div>
    </ModalShell>
  );
};
