import React from 'react';

import { designSystem } from '../../styles/designSystem';

import { ModalActionButtons } from './ModalActionButtons';
import { ModalBase } from './ModalBase';

interface ConflictModalProps {
  isOpen: boolean;
  activity: { name: string } | null;
  room: { name: string };
  supervisors: Array<{ id: number; name: string }>;
  onForceStart: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

/**
 * Session-conflict modal: shown when starting a session collides with an
 * already running one; offers a force start. Purely props-driven.
 */
export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  activity,
  room,
  supervisors,
  onForceStart,
  onCancel,
  isLoading,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onCancel}
    size="sm"
    backgroundColor="#FFFFFF"
    closeOnBackdropClick={!isLoading}
  >
    {/* Warning Icon */}
    <div
      style={{
        width: '64px',
        height: '64px',
        background: designSystem.status.sick,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px auto',
        boxShadow: '0 4px 12px rgba(234, 179, 8, 0.2)',
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
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>

    <h2
      style={{
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '16px',
        color: '#1F2937',
        lineHeight: 1.2,
      }}
    >
      Session Konflikt
    </h2>

    <p
      style={{
        fontSize: '16px',
        color: '#6B7280',
        marginBottom: '32px',
        lineHeight: 1.5,
      }}
    >
      Es läuft bereits eine Session für diese Aktivität oder diesen Raum. Möchten Sie die bestehende
      Session beenden und eine neue starten?
    </p>

    {/* Activity Details Card */}
    <div
      style={{
        backgroundColor: '#FEF3C7',
        borderRadius: designSystem.borderRadius.lg,
        padding: '24px',
        marginBottom: '32px',
        border: '1px solid #FCD34D',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          color: '#92400E',
          marginBottom: '8px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Neue Session
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          marginBottom: '12px',
        }}
      >
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
            fontSize: '16px',
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
            stroke="#f87C10"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
            <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
            <circle cx="11" cy="12" r="1" />
          </svg>
          {room.name}
        </div>
      </div>
    </div>

    {/* Supervisors */}
    <div
      style={{
        backgroundColor: '#F0F9FF',
        borderRadius: designSystem.borderRadius.lg,
        padding: '20px',
        marginBottom: '32px',
        border: '1px solid #BAE6FD',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#0369A1',
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
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#1F2937',
              border: '1px solid #E0E7FF',
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

    {/* Warning Message */}
    <div
      style={{
        backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: designSystem.borderRadius.md,
        padding: '16px',
        marginBottom: '32px',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          color: '#DC2626',
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        Diese Aktion beendet die aktuelle Session
      </div>
    </div>

    <ModalActionButtons
      onCancel={onCancel}
      onConfirm={onForceStart}
      isLoading={isLoading}
      confirmLabel="Trotzdem starten"
      loadingLabel="Starte..."
      // destructive takeover → red-600 (#DC2626), §4b
      confirmGradient={designSystem.flat.dangerHover}
    />
  </ModalBase>
);
