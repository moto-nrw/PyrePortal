import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useCallback, useState } from 'react';

import { designSystem } from '../styles/designSystem';

import { ModalShell } from './ui/modal/index';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

/**
 * InfoModal - Displays informational messages with a "Verstanden" button.
 *
 * Refactored to use ModalShell for consistent backdrop behavior.
 * Uses centralized Tailwind animations for fade and slide effects.
 * Preserves Escape key close behavior and message whitespace formatting.
 *
 * @example
 * <InfoModal
 *   isOpen={showInfo}
 *   onClose={() => setShowInfo(false)}
 *   title="Information"
 *   message="This is an important message"
 * />
 */
export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, message }) => {
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  // Wrap onClose to ignore the reason parameter (preserve original API)
  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      backdropOpacity={0.6}
      backdropBlur="4px"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <div
        className="animate-modal-slide-in"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: designSystem.borderRadius.xl,
          padding: '32px',
          maxWidth: '480px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Info Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(to right, #3B82F6, #2563EB)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
          }}
        >
          <FontAwesomeIcon icon={faCircleInfo} style={{ color: '#FFFFFF', fontSize: '32px' }} />
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#1F2937',
            marginBottom: '16px',
          }}
        >
          {title}
        </h2>

        {/* Message */}
        <p
          style={{
            fontSize: '16px',
            color: '#4B5563',
            lineHeight: 1.6,
            marginBottom: '32px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message}
        </p>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: '48px',
            fontSize: '16px',
            fontWeight: 600,
            color: '#FFFFFF',
            background: 'linear-gradient(to right, #3B82F6, #2563EB)',
            border: 'none',
            borderRadius: designSystem.borderRadius.lg,
            cursor: 'pointer',
            transition: 'all 200ms',
            outline: 'none',
            boxShadow: isButtonHovered
              ? '0 6px 20px 0 rgba(59, 130, 246, 0.5)'
              : '0 4px 14px 0 rgba(59, 130, 246, 0.4)',
            transform: isButtonHovered ? 'translateY(-1px)' : 'translateY(0)',
          }}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
        >
          Verstanden
        </button>
      </div>
    </ModalShell>
  );
};
