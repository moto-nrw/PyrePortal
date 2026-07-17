import React from 'react';

import { designSystem } from '../../styles/designSystem';

import { ModalActionButtons } from './ModalActionButtons';
import { ModalBase } from './ModalBase';

interface ConfirmationModalProps {
  isOpen: boolean;
  activity: { name: string } | null;
  room: { name: string; room_type?: string };
  supervisors: Array<{ id: number; name: string }>;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

/**
 * Session-start confirmation modal: shows the selected activity, room and
 * supervisors before starting a supervision session. Purely props-driven.
 */
export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  activity,
  room,
  supervisors,
  onConfirm,
  onCancel,
  isLoading,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onCancel}
    size="md"
    backgroundColor="#FFFFFF"
    backdropBlur="6px"
    closeOnBackdropClick={!isLoading}
  >
    {/* Header Icon */}
    <div
      style={{
        width: '64px',
        height: '64px',
        background: designSystem.brand.green,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px auto',
        boxShadow: '0 4px 12px rgba(131, 205, 45, 0.2)',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </div>

    <h2
      style={{
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '12px',
        color: '#1F2937',
        lineHeight: 1.2,
      }}
    >
      Aufsicht starten?
    </h2>

    {/* Activity Details Card */}
    <div
      style={{
        backgroundColor: '#F8FAFC',
        borderRadius: designSystem.borderRadius.lg,
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #E5E7EB',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginBottom: '8px',
        }}
      >
        <div
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#14B8A6"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {activity?.name}
        </div>

        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#9CA3AF',
          }}
        ></div>

        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4f46e5"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
            <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
            <circle cx="11" cy="12" r="1" />
          </svg>
          {room.name}
        </div>
      </div>

      {room.room_type && (
        <div
          style={{
            fontSize: '14px',
            color: '#6B7280',
            marginBottom: '0px',
          }}
        >
          Typ: {room.room_type}
        </div>
      )}
    </div>

    {/* Supervisors */}
    <div
      style={{
        backgroundColor: '#F9FAFB',
        borderRadius: designSystem.borderRadius.lg,
        padding: '16px',
        marginBottom: '20px',
        border: '1px solid #E5E7EB',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#374151',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Betreuer ({supervisors.length})
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {supervisors.map(supervisor => (
          <div
            key={supervisor.id}
            style={{
              backgroundColor: '#FFFFFF',
              padding: '8px 12px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1F2937',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14B8A6"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {supervisor.name}
          </div>
        ))}
      </div>
    </div>

    <ModalActionButtons
      onCancel={onCancel}
      onConfirm={onConfirm}
      isLoading={isLoading}
      confirmLabel="Aufsicht starten"
      loadingLabel="Starte..."
    />
  </ModalBase>
);
