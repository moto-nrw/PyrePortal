import React, { useState } from 'react';

import { getRelativeTime } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import { InfoModal } from './InfoModal';

export const LastSessionToggle: React.FC = () => {
  const { sessionSettings, toggleUseLastSession } = useUserStore();
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  if (!sessionSettings) return null;
  
  const isEnabled = sessionSettings.use_last_session;
  const hasLastSession = !!sessionSettings.last_session;
  const savedTime = sessionSettings.last_session?.saved_at;
  
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
          height: '56px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: '28px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
          border: '1px solid rgba(229, 231, 235, 0.5)',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          transition: 'all 200ms ease-out',
        }}
        onMouseEnter={(e) => {
          if (!hasLastSession) return;
          const el = e.currentTarget;
          el.style.transform = 'scale(1.02)';
          el.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.12)';
        }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
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
              transition: 'transform 200ms ease-out',
              transform: `translateX(${isEnabled ? '0' : '0'})`,
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
              ✓
            </div>
          )}
        </div>
        
        <span
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#374151',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '20px' }}>↻</span>
          Letzte Sitzung
        </span>
        
        {savedTime && hasLastSession && (
          <span
            style={{
              fontSize: '14px',
              color: '#6B7280',
              fontWeight: 400,
            }}
          >
            ({getRelativeTime(savedTime)})
          </span>
        )}
      </label>
      
      {/* Info button */}
      <button
        onClick={() => setShowInfoModal(true)}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: '#F3F4F6',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          color: '#6B7280',
          cursor: 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.backgroundColor = '#E5E7EB';
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.backgroundColor = '#F3F4F6';
        }}
      >
        ⓘ
      </button>
    </div>
    
    {/* Info Modal */}
    <InfoModal
      isOpen={showInfoModal}
      onClose={() => setShowInfoModal(false)}
      title="Letzte Sitzung verwenden"
      message="Diese Funktion ermöglicht es Ihnen, die zuletzt gestartete Aktivität mit einem Klick zu wiederholen.

Die gespeicherten Daten umfassen:
• Aktivität
• Raum
• Betreuer

Die Daten werden automatisch bei jedem erfolgreichen Start einer neuen Aktivität aktualisiert. Wenn eine der gespeicherten Komponenten nicht mehr verfügbar ist, wird die Speicherung gelöscht und Sie müssen die Aktivität neu erstellen."
    />
    </>
  );
};