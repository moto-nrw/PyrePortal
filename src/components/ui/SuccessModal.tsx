import React, { useCallback } from 'react';

import theme from '../../styles/theme';

import { ModalShell } from './modal/index';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  autoCloseDelay?: number;
}

/**
 * SuccessModal - Displays success messages with auto-close and pop animation.
 *
 * Refactored to use ModalShell for consistent backdrop behavior.
 * Uses centralized Tailwind animation for pop effect.
 * Preserves original API and styling.
 *
 * @example
 * <SuccessModal
 *   isOpen={showSuccess}
 *   onClose={() => setShowSuccess(false)}
 *   message="Operation completed successfully"
 *   autoCloseDelay={1500}
 * />
 */
export const SuccessModal: React.FC<SuccessModalProps> = ({
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
        className="animate-modal-pop"
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
        <div
          style={{
            width: '80px',
            height: '80px',
            backgroundColor: '#EFF9E5',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            marginBottom: theme.spacing.lg,
            boxShadow: '0 4px 12px rgba(131, 205, 45, 0.25)',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#83CD2D"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.lg,
            color: '#83CD2D',
          }}
        >
          Erfolgreich!
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
