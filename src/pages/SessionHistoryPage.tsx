import { faPlay, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  ErrorModal,
  ModalActionButtons,
  ModalBase,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { usePagination } from '../hooks/usePagination';
import {
  formatRoomName,
  getNetworkErrorMessage,
  isNetworkRelatedError,
  mapServerErrorToGerman,
} from '../services/api';
import type { SessionHistoryEntry } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction } from '../utils/logger';

const logger = createLogger('SessionHistoryPage');

/** User-facing German UI copy for this page */
const texts = {
  title: 'Letzte Aufsichten',
  hint: 'Antippen startet die Aufsicht neu.',
  clearAll: 'Alle löschen',
  removeEntryLabel: 'Eintrag löschen',
  emptyHint: 'Keine Einträge vorhanden.',
  lastUsedPrefix: 'Zuletzt:',
  recreationErrorFallback: 'Fehler beim Starten der Aktivität',
  validationFailedFallback:
    'Die gespeicherte Sitzung konnte nicht überprüft werden. Bitte Verbindung prüfen oder Sitzung neu erstellen.',
  incompleteSessionDataError:
    'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.',
  clearConfirmHeading: 'Verlauf löschen?',
  clearConfirmBody: 'Alle Einträge werden entfernt. Das kann nicht rückgängig gemacht werden.',
  clearConfirmButton: 'Ja, löschen',
  confirmHeading: 'Neue Aufsicht starten?',
} as const;

// 4 rows keep pagination and "Alle löschen" inside the 800px kiosk
// viewport without scrolling.
const ENTRIES_PER_PAGE = 4;

/** Format session recreation error message for display */
function formatRecreationError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : texts.recreationErrorFallback;
  return isNetworkRelatedError(error)
    ? getNetworkErrorMessage('sessionStart')
    : mapServerErrorToGerman(rawMessage);
}

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

function SessionHistoryPage() {
  const {
    authenticatedUser,
    currentSession,
    selectedActivity,
    selectedRoom,
    selectedSupervisors,
    sessionSettings,
    loadSessionSettings,
    removeSessionHistoryEntry,
    clearSessionHistory,
    validateAndRecreateSession,
    isValidatingLastSession,
    recreateSession,
    invalidateSessionRecreation,
  } = useUserStore();
  const navigate = useNavigate();
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isNavigatingToScanning, setIsNavigatingToScanning] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<SessionHistoryEntry | null>(null);
  const isMountedRef = useRef(true);

  const history = sessionSettings?.session_history ?? [];
  const {
    currentPage,
    totalPages,
    paginatedItems,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
  } = usePagination(history, { itemsPerPage: ENTRIES_PER_PAGE });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      invalidateSessionRecreation();
    };
  }, [invalidateSessionRecreation]);

  // A running session means no new session may be started from the history.
  // The isNavigatingToScanning guard keeps the redirect from racing the
  // /nfc-scanning navigation right after a successful recreation.
  useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Session History', '/');
      void navigate('/');
      return;
    }
    if (currentSession && !isNavigatingToScanning) {
      logNavigation('Session History', '/home');
      void navigate('/home');
      return;
    }
    void loadSessionSettings();
  }, [authenticatedUser, currentSession, isNavigatingToScanning, navigate, loadSessionSettings]);

  const handleBack = () => {
    logNavigation('Session History', '/home');
    void navigate('/home');
  };

  const handleSelect = async (entry: SessionHistoryEntry) => {
    if (isValidatingLastSession) return;
    logUserAction('Attempting to recreate session from history', {
      activityId: entry.activity_id,
      roomId: entry.room_id,
    });
    setPendingEntry(entry);
    const outcome = await validateAndRecreateSession(entry);

    if (!isMountedRef.current || outcome.status === 'stale') {
      return;
    }

    if (outcome.status === 'success') {
      setShowConfirmModal(true);
      return;
    }

    const latestError = useUserStore.getState().error ?? texts.validationFailedFallback;
    setErrorMessage(latestError);
    setShowErrorModal(true);
    setShowConfirmModal(false);
  };

  // Helper to show error and close confirm modal
  const showRecreationError = (message: string) => {
    setErrorMessage(message);
    setShowErrorModal(true);
    setShowConfirmModal(false);
  };

  const handleConfirmRecreation = async () => {
    if (!authenticatedUser || !pendingEntry) return;
    // Only one recreation request may be in flight; a duplicate submit would
    // mark the first request stale and then fail with a 409 conflict.
    if (isNavigatingToScanning) return;

    setIsNavigatingToScanning(true);
    const outcome = await recreateSession();

    if (outcome.status === 'incomplete') {
      setIsNavigatingToScanning(false);
      showRecreationError(texts.incompleteSessionDataError);
      return;
    }

    if (outcome.status === 'error') {
      // Stale responses (superseded attempt or invalidation) are discarded
      if (!isMountedRef.current || outcome.stale) {
        return;
      }
      setIsNavigatingToScanning(false);
      showRecreationError(formatRecreationError(outcome.error));
      return;
    }

    // Stale responses (superseded attempt or invalidation) are discarded
    if (!isMountedRef.current || outcome.stale) {
      return;
    }

    logUserAction('Session recreated successfully', {
      sessionId: outcome.session.active_group_id,
    });

    logNavigation('Session History', '/nfc-scanning');
    void navigate('/nfc-scanning');

    setShowConfirmModal(false);
  };

  const handleRemoveEntry = async (entry: SessionHistoryEntry) => {
    logger.info('Removing history entry', {
      activityId: entry.activity_id,
      roomId: entry.room_id,
    });
    await removeSessionHistoryEntry(entry);
  };

  if (!authenticatedUser || (currentSession && !isNavigatingToScanning)) {
    return null; // Will redirect via useEffect
  }

  return (
    <SelectionPageLayout
      title={texts.title}
      onBack={handleBack}
      isLoading={false}
      headerContent={
        <p
          style={{
            fontSize: '22px',
            color: designSystem.gray[500],
            textAlign: 'center',
            margin: '0 auto 24px',
            maxWidth: '800px',
            lineHeight: 1.4,
          }}
        >
          {texts.hint}
        </p>
      }
    >
      <div
        style={{
          width: '100%',
          maxWidth: '860px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          flex: 1,
        }}
      >
        {history.length === 0 ? (
          <p
            style={{
              fontSize: '24px',
              color: designSystem.gray[500],
              textAlign: 'center',
              marginTop: '48px',
            }}
          >
            {texts.emptyHint}
          </p>
        ) : (
          <>
            {paginatedItems.map(entry => (
              <div
                key={`${entry.activity_id}-${entry.room_id}-${entry.supervisor_ids.join('-')}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleSelect(entry)}
                  disabled={isValidatingLastSession}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    backgroundColor: designSystem.colors.white,
                    border: `1px solid ${designSystem.gray[200]}`,
                    borderRadius: designSystem.borderRadius.lg,
                    padding: '18px 24px',
                    cursor: isValidatingLastSession ? 'not-allowed' : 'pointer',
                    opacity: isValidatingLastSession ? 0.6 : 1,
                    transition: designSystem.transitions.base,
                    minHeight: '88px',
                    boxShadow: designSystem.shadows.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '16px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '24px',
                          fontWeight: 600,
                          color: designSystem.gray[900],
                        }}
                      >
                        {entry.activity_name}
                      </span>
                      <span style={{ fontSize: '16px', color: designSystem.gray[500] }}>
                        {texts.lastUsedPrefix} {formatLastUsed(entry.saved_at)}
                      </span>
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: '6px',
                        fontSize: '18px',
                        color: designSystem.gray[500],
                      }}
                    >
                      {formatRoomName(entry.room_name)} · {entry.supervisor_names.join(', ')}
                    </span>
                  </span>
                  {/* Visual affordance only; the whole card is the button */}
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: '56px',
                      height: '56px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: designSystem.pastel.green.tint,
                      color: designSystem.pastel.green.accent,
                      borderRadius: designSystem.borderRadius.full,
                    }}
                  >
                    <FontAwesomeIcon icon={faPlay} style={{ fontSize: '20px' }} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={texts.removeEntryLabel}
                  onClick={() => void handleRemoveEntry(entry)}
                  style={{
                    width: '72px',
                    height: '72px',
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
                  <FontAwesomeIcon icon={faXmark} style={{ fontSize: '28px' }} />
                </button>
              </div>
            ))}

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              onPrevPage={goToPrevPage}
              onNextPage={goToNextPage}
            />

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(true)}
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: designSystem.pastel.red.accent,
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  minHeight: '56px',
                  padding: '12px 24px',
                  borderRadius: designSystem.borderRadius.full,
                }}
              >
                <FontAwesomeIcon icon={faTrashCan} style={{ marginRight: '10px' }} />
                {texts.clearAll}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Clear-history confirmation: destructive, requires an explicit yes */}
      <ModalBase
        isOpen={showClearConfirmModal}
        onClose={() => setShowClearConfirmModal(false)}
        size="sm"
        backgroundColor={designSystem.colors.white}
      >
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: designSystem.gray[900],
            marginBottom: '16px',
          }}
        >
          {texts.clearConfirmHeading}
        </h2>

        <p
          style={{
            fontSize: '20px',
            color: designSystem.gray[500],
            marginBottom: '28px',
            lineHeight: 1.5,
          }}
        >
          {texts.clearConfirmBody}
        </p>

        <ModalActionButtons
          onCancel={() => setShowClearConfirmModal(false)}
          onConfirm={() => {
            setShowClearConfirmModal(false);
            void clearSessionHistory();
          }}
          confirmLabel={texts.clearConfirmButton}
          // destructive clear → unified modal red (#CC2626), §4b
          confirmGradient={designSystem.flat.danger}
        />
      </ModalBase>

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
        autoCloseDelay={3000}
      />

      {/* Confirmation Modal: starts a NEW session with the selected combination */}
      {selectedRoom && (
        <ConfirmationModal
          isOpen={showConfirmModal && !!pendingEntry}
          heading={texts.confirmHeading}
          activity={selectedActivity}
          room={selectedRoom}
          supervisors={selectedSupervisors}
          onConfirm={handleConfirmRecreation}
          onCancel={() => setShowConfirmModal(false)}
          isLoading={isValidatingLastSession || isNavigatingToScanning}
        />
      )}
    </SelectionPageLayout>
  );
}

export default SessionHistoryPage;
