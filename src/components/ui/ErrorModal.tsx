import { faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import theme from '../../styles/theme';

import { ModalBase } from './ModalBase';

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
  autoCloseDelay = 3000,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onClose}
    size="sm"
    backgroundColor={theme.colors.background.light}
    timeout={autoCloseDelay}
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
  </ModalBase>
);
