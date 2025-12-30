import React from 'react';

import theme from '../../styles/theme';

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
    backgroundColor={theme.colors.background.light}
    timeout={autoCloseDelay}
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
  </ModalBase>
);
