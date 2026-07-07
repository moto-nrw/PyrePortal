import { faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import { designSystem } from '../../styles/designSystem';

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
    backgroundColor={designSystem.colors.white}
    timeout={autoCloseDelay}
  >
    <div style={{ marginBottom: designSystem.spacing.lg, color: '#DC2626' }}>
      <FontAwesomeIcon icon={faCircleXmark} style={{ fontSize: '3rem' }} />
    </div>
    <h2
      style={{
        fontSize: designSystem.fonts.size.xl,
        fontWeight: designSystem.fonts.weight.bold,
        marginBottom: designSystem.spacing.lg,
        color: designSystem.colors.textStrong,
      }}
    >
      Fehler
    </h2>
    <div
      style={{
        fontSize: designSystem.fonts.size.large,
        color: designSystem.colors.textSubtle,
        marginBottom: designSystem.spacing.xl,
      }}
    >
      {message}
    </div>
  </ModalBase>
);
