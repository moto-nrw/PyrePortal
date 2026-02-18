import { faArrowsRotate, faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import { useUserStore } from '../store/userStore';

export const LastSessionToggle: React.FC = () => {
  const { sessionSettings, toggleUseLastSession } = useUserStore();

  if (!sessionSettings) return null;

  const isEnabled = sessionSettings.use_last_session;
  const hasLastSession = !!sessionSettings.last_session;

  const handleToggleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;

    // Only allow enabling if we have a saved session
    if (newValue && !hasLastSession) {
      // Could show a toast here
      return;
    }

    await toggleUseLastSession(newValue);
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 30,
          height: '68px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: '34px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
          border: '1px solid rgba(229, 231, 235, 0.5)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: hasLastSession ? 'pointer' : 'not-allowed',
            opacity: hasLastSession ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggleChange}
            disabled={!hasLastSession}
            style={{ display: 'none' }}
          />

          {/* Custom toggle switch */}
          <div
            style={{
              position: 'relative',
              width: '48px',
              height: '28px',
              backgroundColor: isEnabled ? '#83CD2D' : '#E5E7EB',
              borderRadius: '9999px',
              transition: 'background-color 200ms ease-out',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: isEnabled ? '22px' : '2px',
                width: '24px',
                height: '24px',
                backgroundColor: '#FFFFFF',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: 'left 200ms ease-out',
              }}
            />
            {isEnabled && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '8px',
                  transform: 'translateY(-50%)',
                  fontSize: '14px',
                  color: '#FFFFFF',
                }}
              >
                <FontAwesomeIcon icon={faCheck} style={{ fontSize: '12px' }} />
              </div>
            )}
          </div>

          <span
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FontAwesomeIcon icon={faArrowsRotate} style={{ fontSize: '20px' }} />
            Letzte Aufsicht wiederholen
          </span>
        </label>
      </div>
    </>
  );
};
