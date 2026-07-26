import React from 'react';

import { designSystem } from '../../styles/designSystem';

import { ModalBase } from './ModalBase';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  autoCloseDelay?: number;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
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
    <div
      style={{
        width: '80px',
        height: '80px',
        backgroundColor: designSystem.brand.greenTint,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
        marginBottom: designSystem.spacing.lg,
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke={designSystem.brand.greenText}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
    <h2
      style={{
        fontSize: designSystem.fonts.size.xl,
        fontWeight: designSystem.fonts.weight.bold,
        marginBottom: designSystem.spacing.lg,
        color: designSystem.brand.greenText,
      }}
    >
      Erfolgreich!
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
