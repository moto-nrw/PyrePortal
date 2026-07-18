import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { LastSessionToggle } from '../components/LastSessionToggle';
import { ErrorModal, ModalBase, ModalActionButtons } from '../components/ui';
import {
  api,
  formatRoomName,
  getNetworkErrorMessage,
  isNetworkRelatedError,
  mapServerErrorToGerman,
  type CurrentSession,
} from '../services/api';
import type { SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction, serializeError } from '../utils/logger';

const logger = createLogger('HomeViewPage');

/** User-facing German UI copy for this page */
const texts = {
  recreationErrorFallback: 'Fehler beim Starten der Aktivität',
  activityFallback: 'Aktivität',
  repeatSessionHeading: 'Aufsicht wiederholen',
  startSessionHeading: 'Aufsicht starten',
  continueSubtitle: 'Fortsetzen',
  supervisorCountMismatch: (selected: number, saved: number) =>
    `${selected} Betreuer (gespeichert: ${saved})`,
  supervisorCount: (count: number) => `${count} Betreuer`,
  validationFailedFallback:
    'Die gespeicherte Sitzung konnte nicht überprüft werden. Bitte Verbindung prüfen oder Sitzung neu erstellen.',
  incompleteSessionDataError:
    'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.',
  tagAssignmentButton: 'Armband identifizieren',
  endSessionButton: 'Aufsicht beenden',
  logoutButton: 'Abmelden',
  menuHeading: 'Menü',
  teamManagementButton: 'Team anpassen',
  recreationConfirmHeading: 'Aufsicht wiederholen?',
  roomLabel: 'Raum:',
  supervisorsLabel: 'Betreuer:',
  recreationConfirmButton: 'Aufsicht starten',
  recreationLoadingButton: 'Starte...',
  endSessionConfirmHeading: 'Aufsicht beenden?',
  endSessionWarningPrefix: 'Alle Kinder, die in dieser Aufsicht sind, werden auf den Status',
  endSessionWarningHighlight: 'unterwegs',
  endSessionWarningSuffix: 'umgestellt.',
  endSessionConfirmButton: 'Ja, beenden',
} as const;

// ============================================================================
// Pure helper functions (moved outside component to reduce cognitive complexity)
// ============================================================================

/** Format session recreation error message for display */
function formatRecreationError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : texts.recreationErrorFallback;
  return isNetworkRelatedError(error)
    ? getNetworkErrorMessage('sessionStart')
    : mapServerErrorToGerman(rawMessage);
}

/** Get appropriate activity icon based on session state */
function getActivityIcon(
  currentSession: CurrentSession | null,
  sessionSettings: SessionSettings | null
): React.ReactNode {
  if (currentSession) {
    return (
      <svg width="52" height="52" viewBox="0 0 24 24" fill={designSystem.brand.green} stroke="none">
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }
  if (sessionSettings?.use_last_session && sessionSettings.last_session) {
    return (
      <svg
        width="52"
        height="52"
        viewBox="0 0 24 24"
        fill="none"
        stroke={designSystem.brand.green}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    );
  }
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      stroke={designSystem.brand.green}
      strokeWidth="2.5"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/** Get activity heading text based on session state */
function getActivityHeading(
  currentSession: CurrentSession | null,
  sessionSettings: SessionSettings | null
): string {
  if (currentSession) {
    return currentSession.activity_name ?? texts.activityFallback;
  }
  if (sessionSettings?.use_last_session && sessionSettings.last_session) {
    return texts.repeatSessionHeading;
  }
  return texts.startSessionHeading;
}

/** Get activity subtitle text based on session state */
function getActivitySubtitle(
  currentSession: CurrentSession | null,
  sessionSettings: SessionSettings | null
): string {
  if (currentSession) {
    return texts.continueSubtitle;
  }
  if (sessionSettings?.use_last_session && sessionSettings.last_session) {
    return sessionSettings.last_session.activity_name;
  }
  return '';
}

/** Get supervisor count label for saved session display */
function getSupervisorCountLabel(
  sessionSettings: SessionSettings | null,
  selectedSupervisorsCount: number
): string {
  if (!sessionSettings?.last_session) {
    return '';
  }
  const savedCount = sessionSettings.last_session.supervisor_names.length;

  if (selectedSupervisorsCount > 0 && selectedSupervisorsCount !== savedCount) {
    return texts.supervisorCountMismatch(selectedSupervisorsCount, savedCount);
  }
  if (selectedSupervisorsCount > 0) {
    return texts.supervisorCount(selectedSupervisorsCount);
  }
  return texts.supervisorCount(savedCount);
}

// ============================================================================
// Component
// ============================================================================

function HomeViewPage() {
  const {
    authenticatedUser,
    currentSession,
    logout,
    fetchCurrentSession,
    selectedSupervisors,
    sessionSettings,
    loadSessionSettings,
    validateAndRecreateSession,
    isValidatingLastSession,
    recreateSession,
    invalidateSessionRecreation,
  } = useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [isNavigatingToScanning, setIsNavigatingToScanning] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      invalidateSessionRecreation();
    };
  }, [invalidateSessionRecreation]);

  // Helper to end the current session
  const endCurrentSession = async () => {
    logUserAction('Ending current session');
    try {
      await api.endSession(authenticatedUser!.pin);
      await fetchCurrentSession();
      logUserAction('Session ended successfully');
    } catch (error) {
      logger.error('Failed to end session', { error: serializeError(error) });
    }
  };

  // Helper to perform user logout
  const performLogout = async () => {
    invalidateSessionRecreation();
    setIsNavigatingToScanning(false);
    logUserAction('User logout initiated');
    await logout();
    logNavigation('Home View', '/');
    void navigate('/');
  };

  const handleLogout = async () => {
    setTouchedButton(null);
    if (isValidatingLastSession) return;
    if (currentSession) {
      setShowEndSessionModal(true);
    } else {
      await performLogout();
    }
  };

  const handleConfirmEndSession = async () => {
    setShowEndSessionModal(false);
    await endCurrentSession();
  };

  const handleTagAssignment = () => {
    setTouchedButton(null);
    logNavigation('Home View', '/tag-assignment');
    void navigate('/tag-assignment');
  };

  // Helper to handle last session recreation attempt
  const attemptSessionRecreation = async () => {
    logUserAction('Attempting to recreate last session');
    const outcome = await validateAndRecreateSession();

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

  const handleStartActivity = async () => {
    const shouldRecreateLastSession =
      sessionSettings?.use_last_session && sessionSettings.last_session;

    if (shouldRecreateLastSession) {
      await attemptSessionRecreation();
    } else {
      logNavigation('Home View', '/activity-selection');
      void navigate('/activity-selection');
    }
  };

  const handleContinueActivity = () => {
    if (currentSession) {
      logNavigation('Home View', '/nfc-scanning', {
        activeGroupId: currentSession.active_group_id,
        activityName: currentSession.activity_name,
      });
      void navigate('/nfc-scanning');
    }
  };

  const handleTeamManagement = () => {
    logNavigation('Home View', '/team-management');
    void navigate('/team-management');
  };

  // Helper to show error and close confirm modal
  const showRecreationError = (message: string) => {
    setErrorMessage(message);
    setShowErrorModal(true);
    setShowConfirmModal(false);
  };

  const handleConfirmRecreation = async () => {
    if (!authenticatedUser || !sessionSettings?.last_session) return;
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
      // Stale responses (superseded attempt or logout) are discarded
      if (!isMountedRef.current || outcome.stale) {
        return;
      }
      setIsNavigatingToScanning(false);
      showRecreationError(formatRecreationError(outcome.error));
      return;
    }

    // Stale responses (superseded attempt or logout) are discarded
    if (!isMountedRef.current || outcome.stale) {
      return;
    }

    logUserAction('Session recreated successfully', {
      sessionId: outcome.session.active_group_id,
    });

    logNavigation('Home View', '/nfc-scanning');
    void navigate('/nfc-scanning');

    setShowConfirmModal(false);
  };

  // Redirect to login if no authenticated user and fetch current session
  useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Home View', '/');
      void navigate('/');
      return;
    }

    // Check for existing session when component mounts
    void fetchCurrentSession();

    // Load session settings
    void loadSessionSettings();
  }, [authenticatedUser, navigate, fetchCurrentSession, loadSessionSettings]);

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <BackgroundWrapper>
      <div className="h-screen w-screen overflow-auto p-8">
        {/* NFC Scan button - Top Left */}
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            zIndex: 50,
          }}
        >
          <button
            type="button"
            onClick={handleTagAssignment}
            onTouchStart={() => setTouchedButton('tag')}
            onTouchEnd={() => setTouchedButton(null)}
            onTouchCancel={() => setTouchedButton(null)}
            onPointerLeave={() => setTouchedButton(current => (current === 'tag' ? null : current))}
            style={{
              height: '68px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '0 32px',
              backgroundColor:
                touchedButton === 'tag' ? designSystem.flat.actionHover : designSystem.flat.action,
              border: 'none',
              borderRadius: '34px',
              cursor: 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              boxShadow: designSystem.shadows.md,
              transform: touchedButton === 'tag' ? designSystem.scales.activeSmall : 'scale(1)',
            }}
          >
            <FontAwesomeIcon
              icon={faWifi}
              size="xl"
              style={{ color: designSystem.colors.white, transform: 'rotate(90deg)' }}
            />
            <span
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: designSystem.colors.white,
              }}
            >
              {texts.tagAssignmentButton}
            </span>
          </button>
        </div>

        {/* Modern logout button - Top Right */}
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 50,
          }}
        >
          <button
            type="button"
            onClick={handleLogout}
            disabled={isValidatingLastSession}
            onTouchStart={() => {
              if (!isValidatingLastSession) setTouchedButton('logout');
            }}
            onTouchEnd={() => setTouchedButton(null)}
            onTouchCancel={() => setTouchedButton(null)}
            onPointerLeave={() =>
              setTouchedButton(current => (current === 'logout' ? null : current))
            }
            style={{
              height: '68px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '0 32px',
              backgroundColor:
                touchedButton === 'logout'
                  ? designSystem.brand.redPillBg
                  : designSystem.colors.white,
              border: `1px solid ${designSystem.brand.red}`,
              borderRadius: '34px',
              cursor: isValidatingLastSession ? 'not-allowed' : 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              boxShadow: designSystem.shadows.sm,
              transform: touchedButton === 'logout' ? designSystem.scales.activeSmall : 'scale(1)',
              opacity: isValidatingLastSession ? 0.6 : 1,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke={designSystem.brand.red}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: designSystem.brand.red,
              }}
            >
              {currentSession && !isNavigatingToScanning
                ? texts.endSessionButton
                : texts.logoutButton}
            </span>
          </button>
        </div>

        {/* Welcome Header - Larger for Accessibility */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '40px',
            marginBottom: '48px',
          }}
        >
          <h1
            style={{
              fontSize: '56px',
              fontWeight: 700,
              margin: 0,
              color: designSystem.gray[900],
              lineHeight: 1.2,
            }}
          >
            {texts.menuHeading}
          </h1>
        </div>

        {/* Main Content - Positioned Higher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '60px',
          }}
        >
          <div style={{ width: '100%', maxWidth: '800px' }}>
            {/* Primary Actions Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '24px',
                marginBottom: '24px',
              }}
            >
              {/* Activity Button - Phoenix Clean Style */}
              <button
                onClick={currentSession ? handleContinueActivity : handleStartActivity}
                onTouchStart={() => setTouchedButton('activity')}
                onTouchEnd={() => setTouchedButton(null)}
                disabled={isValidatingLastSession}
                style={{
                  backgroundColor: designSystem.surface.background,
                  border: `1px solid ${designSystem.surface.border}`,
                  borderRadius: designSystem.surface.borderRadius,
                  padding: '36px',
                  transition: designSystem.transitions.base,
                  outline: 'none',
                  minHeight: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'activity' ? 'scale(0.98)' : 'scale(1)',
                  boxShadow:
                    touchedButton === 'activity'
                      ? '0 1px 2px rgba(0, 0, 0, 0.06)'
                      : designSystem.surface.shadow,
                  opacity: isValidatingLastSession ? 0.7 : 1,
                  cursor: isValidatingLastSession ? 'not-allowed' : 'pointer',
                }}
              >
                {/* Content */}
                <div>
                  <div
                    style={{
                      width: '88px',
                      height: '88px',
                      backgroundColor: designSystem.brand.greenPillBg,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    {getActivityIcon(currentSession, sessionSettings)}
                  </div>

                  <h3
                    style={{
                      fontSize: '28px',
                      fontWeight: 600,
                      color: designSystem.gray[900],
                      margin: '0 0 8px 0',
                      textAlign: 'center',
                    }}
                  >
                    {getActivityHeading(currentSession, sessionSettings)}
                  </h3>
                  <p
                    style={{
                      fontSize: '18px',
                      color: designSystem.gray[500],
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    {getActivitySubtitle(currentSession, sessionSettings)}
                  </p>

                  {/* Show room and supervisor info for saved session */}
                  {!currentSession &&
                    sessionSettings?.use_last_session &&
                    sessionSettings.last_session && (
                      <div
                        style={{
                          marginTop: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              backgroundColor: designSystem.brand.bluePillBg,
                              color: designSystem.brand.blue,
                              padding: '4px 12px',
                              borderRadius: designSystem.borderRadius.full,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {formatRoomName(sessionSettings.last_session.room_name)}
                          </span>
                          <span
                            style={{
                              fontSize: '13px',
                              backgroundColor: designSystem.brand.greenPillBg,
                              color: designSystem.brand.greenText,
                              padding: '4px 12px',
                              borderRadius: designSystem.borderRadius.full,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            {getSupervisorCountLabel(sessionSettings, selectedSupervisors.length)}
                          </span>
                        </div>
                      </div>
                    )}
                </div>
              </button>

              {/* Team Management Button - Phoenix Clean Style */}
              <button
                onClick={handleTeamManagement}
                onTouchStart={() => setTouchedButton('team')}
                onTouchEnd={() => setTouchedButton(null)}
                style={{
                  backgroundColor: designSystem.surface.background,
                  border: `1px solid ${designSystem.surface.border}`,
                  borderRadius: designSystem.surface.borderRadius,
                  padding: '36px',
                  cursor: 'pointer',
                  transition: designSystem.transitions.base,
                  outline: 'none',
                  minHeight: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'team' ? 'scale(0.98)' : 'scale(1)',
                  boxShadow:
                    touchedButton === 'team'
                      ? '0 1px 2px rgba(0, 0, 0, 0.06)'
                      : designSystem.surface.shadow,
                }}
              >
                {/* Content */}
                <div>
                  <div
                    style={{
                      width: '88px',
                      height: '88px',
                      backgroundColor: 'rgba(124, 58, 237, 0.15)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <svg
                      width="52"
                      height="52"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={designSystem.status.excused}
                      strokeWidth="2.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>

                  <h3
                    style={{
                      fontSize: '28px',
                      fontWeight: 600,
                      color: designSystem.gray[900],
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    {texts.teamManagementButton}
                  </h3>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Last Session Toggle - only show when no current session */}
        {!currentSession && <LastSessionToggle />}
      </div>

      {/* Add animation keyframes */}
      <style>
        {`
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(80, 128, 216, 0.5);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(80, 128, 216, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(80, 128, 216, 0);
            }
          }
        `}
      </style>

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
        autoCloseDelay={3000}
      />

      {/* Confirmation Modal for Recreation */}
      <ModalBase
        isOpen={showConfirmModal && !!sessionSettings?.last_session}
        onClose={() => setShowConfirmModal(false)}
        size="sm"
        backgroundColor={designSystem.colors.white}
        closeOnBackdropClick={!isValidatingLastSession && !isNavigatingToScanning}
      >
        {/* Success Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: designSystem.flat.success,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: designSystem.shadows.md,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: designSystem.gray[900],
            marginBottom: '12px',
          }}
        >
          {texts.recreationConfirmHeading}
        </h2>

        {/* Activity Details */}
        {useUserStore.getState().selectedActivity && useUserStore.getState().selectedRoom && (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: designSystem.gray[700],
                marginBottom: '16px',
              }}
            >
              {useUserStore.getState().selectedActivity?.name}
            </div>

            <div
              style={{
                backgroundColor: designSystem.gray[100],
                borderRadius: designSystem.borderRadius.lg,
                padding: '16px',
                textAlign: 'left',
              }}
            >
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: designSystem.gray[500], fontSize: '14px' }}>
                  {texts.roomLabel}
                </span>
                <span
                  style={{
                    color: designSystem.gray[800],
                    fontSize: '14px',
                    fontWeight: 500,
                    marginLeft: '8px',
                  }}
                >
                  {useUserStore.getState().selectedRoom?.name}
                </span>
              </div>
              <div>
                <span style={{ color: designSystem.gray[500], fontSize: '14px' }}>
                  {texts.supervisorsLabel}
                </span>
                <span
                  style={{
                    color: designSystem.gray[800],
                    fontSize: '14px',
                    fontWeight: 500,
                    marginLeft: '8px',
                  }}
                >
                  {useUserStore
                    .getState()
                    .selectedSupervisors.map(s => s.name)
                    .join(', ')}
                </span>
              </div>
            </div>
          </div>
        )}

        <ModalActionButtons
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmRecreation}
          isLoading={isValidatingLastSession || isNavigatingToScanning}
          confirmLabel={texts.recreationConfirmButton}
          loadingLabel={texts.recreationLoadingButton}
          confirmGradient={designSystem.flat.success}
        />
      </ModalBase>

      {/* End Session Confirmation Modal */}
      <ModalBase
        isOpen={showEndSessionModal}
        onClose={() => setShowEndSessionModal(false)}
        size="sm"
        backgroundColor={designSystem.colors.white}
      >
        {/* Title */}
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: designSystem.gray[900],
            marginBottom: '16px',
          }}
        >
          {texts.endSessionConfirmHeading}
        </h2>

        {/* Warning Text */}
        <p
          style={{
            fontSize: '20px',
            color: designSystem.gray[500],
            marginBottom: '28px',
            lineHeight: 1.5,
          }}
        >
          {texts.endSessionWarningPrefix}{' '}
          <strong style={{ color: designSystem.status.transit }}>
            {texts.endSessionWarningHighlight}
          </strong>{' '}
          {texts.endSessionWarningSuffix}
        </p>

        <ModalActionButtons
          onCancel={() => setShowEndSessionModal(false)}
          onConfirm={handleConfirmEndSession}
          confirmLabel={texts.endSessionConfirmButton}
          // destructive end-session → red-600 (#DC2626), §4b
          confirmGradient={designSystem.flat.dangerHover}
        />
      </ModalBase>
    </BackgroundWrapper>
  );
}

export default HomeViewPage;
