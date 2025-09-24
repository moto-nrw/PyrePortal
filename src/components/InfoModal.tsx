import React, { useEffect } from 'react';

import { designSystem } from '../styles/designSystem';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, message }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 200ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
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
          animation: 'modalSlideIn 300ms ease-out',
        }}
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
          <span style={{ color: '#FFFFFF', fontSize: '32px', fontWeight: 700 }}>ⓘ</span>
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
            boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(59, 130, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(59, 130, 246, 0.4)';
          }}
        >
          Verstanden
        </button>
      </div>

      {/* Animation Styles */}
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes modalSlideIn {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(10px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
};