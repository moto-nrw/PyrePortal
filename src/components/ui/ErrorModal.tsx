import { faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect } from 'react';

import theme from '../../styles/theme';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  autoCloseDelay?: number;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  message,
  autoCloseDelay = 3000, // Default 3 seconds
}) => {
  useEffect(() => {
    if (isOpen && autoCloseDelay) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
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
    </div>
  );
};
