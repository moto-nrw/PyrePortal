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
  confirmGradient = designSystem.flat.success,
  confirmShadow = designSystem.shadows.md,
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
        fontWeight: 500,
        color: designSystem.gray[700],
        backgroundColor: '#FFFFFF',
        border: `1px solid ${designSystem.gray[300]}`,
        borderRadius: designSystem.borderRadius.md,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: designSystem.transitions.base,
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
        fontWeight: 500,
        color: '#FFFFFF',
        background: isLoading ? designSystem.gray[400] : confirmGradient,
        border: 'none',
        borderRadius: designSystem.borderRadius.md,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: designSystem.transitions.base,
        outline: 'none',
        boxShadow: isLoading ? 'none' : confirmShadow,
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
    </button>
  </div>
);
