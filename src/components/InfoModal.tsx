import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import { designSystem } from '../styles/designSystem';

import { ModalBase } from './ui/ModalBase';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, message }) => (
  <ModalBase isOpen={isOpen} onClose={onClose} size="sm" backgroundColor="#FFFFFF">
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
        boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(59, 130, 246, 0.5)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(59, 130, 246, 0.4)';
      }}
    >
      Verstanden
    </button>
  </ModalBase>
);
