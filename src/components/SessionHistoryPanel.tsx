import {
  faChevronUp,
  faClockRotateLeft,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';

import { formatRoomName } from '../services/api';
import type { SessionHistoryEntry } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';

/** User-facing German UI copy for this component */
const texts = {
  panelButton: 'Letzte Aufsichten',
  panelHeading: 'Letzte Aufsichten',
  clearAll: 'Alle löschen',
  removeEntryLabel: 'Eintrag löschen',
  closeLabel: 'Verlauf schließen',
} as const;

/** Format an ISO timestamp as a short German date/time label */
function formatLastUsed(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SessionHistoryPanelProps {
  onSelect: (entry: SessionHistoryEntry) => void;
  disabled?: boolean;
}

export const SessionHistoryPanel: React.FC<SessionHistoryPanelProps> = ({
  onSelect,
  disabled = false,
}) => {
  const { sessionSettings, removeSessionHistoryEntry, clearSessionHistory } = useUserStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const history = sessionSettings?.session_history ?? [];

  if (history.length === 0) return null;

  const handleSelect = (entry: SessionHistoryEntry) => {
    if (disabled) return;
    setIsExpanded(false);
    onSelect(entry);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '12px',
      }}
    >
      {isExpanded && (
        <div
          style={{
            width: '480px',
            maxHeight: '60vh',
            overflowY: 'auto',
            backgroundColor: designSystem.surface.background,
            border: `1px solid ${designSystem.surface.border}`,
            borderRadius: designSystem.surface.borderRadius,
            boxShadow: designSystem.surface.shadow,
            padding: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: designSystem.gray[900],
              }}
            >
              {texts.panelHeading}
            </span>
            <button
              type="button"
              onClick={() => void clearSessionHistory()}
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: designSystem.pastel.red.accent,
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                minHeight: '48px',
                padding: '12px 16px',
                borderRadius: designSystem.borderRadius.full,
              }}
            >
              <FontAwesomeIcon icon={faTrashCan} style={{ marginRight: '8px' }} />
              {texts.clearAll}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {history.map(entry => (
              <div
                key={`${entry.activity_id}-${entry.room_id}-${entry.supervisor_ids.join('-')}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(entry)}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    backgroundColor: designSystem.colors.white,
                    border: `1px solid ${designSystem.gray[200]}`,
                    borderRadius: designSystem.borderRadius.lg,
                    padding: '14px 16px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    transition: designSystem.transitions.base,
                    minHeight: '64px',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: designSystem.gray[900],
                      }}
                    >
                      {entry.activity_name}
                    </span>
                    <span style={{ fontSize: '14px', color: designSystem.gray[500] }}>
                      {formatLastUsed(entry.saved_at)}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '15px',
                      color: designSystem.gray[500],
                    }}
                  >
                    {formatRoomName(entry.room_name)} · {entry.supervisor_names.join(', ')}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={texts.removeEntryLabel}
                  onClick={() => void removeSessionHistoryEntry(entry)}
                  style={{
                    width: '60px',
                    height: '60px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: designSystem.colors.white,
                    border: `1px solid ${designSystem.gray[200]}`,
                    borderRadius: designSystem.borderRadius.full,
                    color: designSystem.gray[500],
                    cursor: 'pointer',
                  }}
                >
                  <FontAwesomeIcon icon={faXmark} style={{ fontSize: '24px' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsExpanded(current => !current)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? texts.closeLabel : texts.panelButton}
        style={{
          height: '68px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 32px',
          backgroundColor: isExpanded ? designSystem.gray[100] : designSystem.colors.white,
          border: `1px solid ${designSystem.gray[200]}`,
          borderRadius: '34px',
          cursor: 'pointer',
          transition: designSystem.transitions.base,
          outline: 'none',
          boxShadow: designSystem.shadows.sm,
        }}
      >
        <FontAwesomeIcon
          icon={faClockRotateLeft}
          style={{ fontSize: '20px', color: designSystem.gray[700] }}
        />
        <span
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: designSystem.gray[700],
          }}
        >
          {texts.panelButton}
        </span>
        <FontAwesomeIcon
          icon={faChevronUp}
          style={{
            fontSize: '16px',
            color: designSystem.gray[500],
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: designSystem.transitions.base,
          }}
        />
      </button>
    </div>
  );
};
