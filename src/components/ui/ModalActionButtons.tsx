import React from 'react';

import { designSystem } from '../../styles/designSystem';

import { SpinKeyframes } from './LoadingSpinner';

interface ModalActionButtonsProps {
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  loadingLabel?: string;
  /**
   * Semantic confirm color override. Prop name kept for backward compatibility
   * (it no longer carries a CSS gradient — modal buttons are flat, §4b).
   * Default confirm is gray-900 (#111827). Pass a brand hex ONLY where the
   * action's meaning demands it: destructive → #DC2626 (red-600), positive
   * confirm → #83CD2D (green). Everything else stays the gray-900 default.
   */
  confirmGradient?: string;
  /**
   * @deprecated Modal confirm buttons carry no resting shadow (§4b). Retained
   * so existing call sites keep compiling; the value is ignored.
   */
  confirmShadow?: string;
}

/** Darker press/hover shade for the known semantic confirm colors. */
const confirmPressColor = (base: string): string => {
  switch (base) {
    case designSystem.brand.primary: // gray-900
      return designSystem.brand.primaryHover; // #1F2937
    case designSystem.flat.success: // green
      return designSystem.flat.successHover; // #74B827
    case designSystem.flat.dangerHover: // red-600 (#DC2626)
      return '#B91C1C'; // red-700
    default:
      return base;
  }
};

/**
 * Reusable cancel/confirm button pair for modal footers.
 *
 * A distinct compact fork of the page-level PillButton (§4b): 56px height,
 * 18px text, flat gray-900 confirm by default (no resting shadow), white
 * bordered cancel, inline spinner while loading.
 */
export const ModalActionButtons: React.FC<ModalActionButtonsProps> = ({
  onCancel,
  onConfirm,
  isLoading = false,
  cancelLabel = 'Abbrechen',
  confirmLabel,
  loadingLabel = 'Wird geladen...',
  confirmGradient = designSystem.brand.primary,
}) => {
  const confirmBase = confirmGradient;
  const confirmPress = confirmPressColor(confirmBase);

  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <SpinKeyframes />

      <button
        onClick={onCancel}
        disabled={isLoading}
        onPointerDown={e => {
          if (isLoading) return;
          e.currentTarget.style.transform = 'scale(0.98)';
          e.currentTarget.style.backgroundColor = designSystem.gray[50];
          e.currentTarget.style.borderColor = designSystem.gray[400];
        }}
        onPointerEnter={e => {
          if (isLoading) return;
          e.currentTarget.style.backgroundColor = designSystem.gray[50];
          e.currentTarget.style.borderColor = designSystem.gray[400];
        }}
        onPointerUp={e => {
          e.currentTarget.style.transform = '';
        }}
        onPointerLeave={e => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.backgroundColor = '#FFFFFF';
          e.currentTarget.style.borderColor = designSystem.gray[300];
        }}
        style={{
          flex: 1,
          height: '56px',
          fontSize: '18px',
          fontWeight: 500,
          color: designSystem.gray[700],
          backgroundColor: '#FFFFFF',
          border: `1px solid ${designSystem.gray[300]}`,
          borderRadius: designSystem.borderRadius.md,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: designSystem.transitions.base,
          outline: 'none',
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        {cancelLabel}
      </button>

      <button
        onClick={onConfirm}
        disabled={isLoading}
        onPointerDown={e => {
          if (isLoading) return;
          e.currentTarget.style.transform = 'scale(0.98)';
          e.currentTarget.style.backgroundColor = confirmPress;
        }}
        onPointerEnter={e => {
          if (isLoading) return;
          e.currentTarget.style.backgroundColor = confirmPress;
        }}
        onPointerUp={e => {
          e.currentTarget.style.transform = '';
        }}
        onPointerLeave={e => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.backgroundColor = confirmBase;
        }}
        style={{
          flex: 1,
          height: '56px',
          fontSize: '18px',
          fontWeight: 500,
          color: '#FFFFFF',
          backgroundColor: isLoading ? designSystem.gray[400] : confirmBase,
          border: 'none',
          borderRadius: designSystem.borderRadius.md,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: designSystem.transitions.base,
          outline: 'none',
          boxShadow: 'none',
          opacity: isLoading ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#FFFFFF',
              animation: 'spin 1s linear infinite',
              flexShrink: 0,
            }}
          />
        )}
        {isLoading ? loadingLabel : confirmLabel}
      </button>
    </div>
  );
};
