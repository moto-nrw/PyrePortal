import React from 'react';

import { designSystem } from '../../styles/designSystem';
import { pressHandlers } from '../../utils/pressHandlers';

interface ModalActionButtonsProps {
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  loadingLabel?: string;
  /** CSS gradient string for the confirm button (default: green) */
  confirmGradient?: string;
  /** CSS box-shadow for the confirm button when not loading */
  confirmShadow?: string;
}

/**
 * Reusable cancel/confirm button pair for modal footers.
 * Provides consistent sizing, press animation, and loading state.
 */
export const ModalActionButtons: React.FC<ModalActionButtonsProps> = ({
  onCancel,
  onConfirm,
  isLoading = false,
  cancelLabel = 'Abbrechen',
  confirmLabel,
  loadingLabel,
  confirmGradient = 'linear-gradient(to right, #83cd2d, #6ba529)',
  confirmShadow = '0 4px 14px 0 rgba(131, 205, 45, 0.4)',
}) => (
  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
    <button
      onClick={onCancel}
      disabled={isLoading}
      {...pressHandlers(isLoading)}
      style={{
        flex: 1,
        height: '68px',
        fontSize: '20px',
        fontWeight: 600,
        color: '#6B7280',
        backgroundColor: 'transparent',
        border: '2px solid #E5E7EB',
        borderRadius: designSystem.borderRadius.lg,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: 'all 200ms',
        outline: 'none',
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {cancelLabel}
    </button>

    <button
      onClick={onConfirm}
      disabled={isLoading}
      {...pressHandlers(isLoading)}
      style={{
        flex: 1,
        height: '68px',
        fontSize: '20px',
        fontWeight: 600,
        color: '#FFFFFF',
        background: isLoading ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)' : confirmGradient,
        border: 'none',
        borderRadius: designSystem.borderRadius.lg,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: 'all 200ms',
        outline: 'none',
        boxShadow: isLoading ? 'none' : confirmShadow,
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
    </button>
  </div>
);
