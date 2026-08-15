import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ContactlessPaymentIcon, ModalBase, ModalActionButtons } from '../components/ui';
import { api, type CurrentSession } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction, serializeError } from '../utils/logger';

const logger = createLogger('HomeViewPage');

/** User-facing German UI copy for this page */
const texts = {
  activityFallback: 'Aktivität',
  startSessionHeading: 'Aufsicht starten',
  continueSubtitle: 'Fortsetzen',
  historyButton: 'Letzte Aufsichten',
  tagAssignmentButton: 'Armband identifizieren',
  endSessionButton: 'Aufsicht beenden',
  logoutButton: 'Abmelden',
  menuHeading: 'Menü',
  teamManagementButton: 'Team anpassen',
  endSessionConfirmHeading: 'Aufsicht beenden?',
  endSessionWarningPrefix: 'Alle Kinder, die in dieser Aufsicht sind, werden auf den Status',
  endSessionWarningHighlight: 'unterwegs',
  endSessionWarningSuffix: 'umgestellt.',
  endSessionConfirmButton: 'Ja, beenden',
} as const;

// ============================================================================
// Pure helper functions (moved outside component to reduce cognitive complexity)
// ============================================================================

/** Get appropriate activity icon based on session state */
function getActivityIcon(currentSession: CurrentSession | null): React.ReactNode {
  if (currentSession) {
    return (
      <svg
        width="52"
        height="52"
        viewBox="0 0 24 24"
        fill={designSystem.pastel.green.accent}
        stroke="none"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke={designSystem.pastel.green.accent}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** Get activity heading text based on session state */
function getActivityHeading(currentSession: CurrentSession | null): string {
  if (currentSession) {
    return currentSession.activity_name ?? texts.activityFallback;
  }
  return texts.startSessionHeading;
}

/** Get activity subtitle text based on session state */
function getActivitySubtitle(currentSession: CurrentSession | null): string {
  return currentSession ? texts.continueSubtitle : '';
}

// ============================================================================
// Component
// ============================================================================

function HomeViewPage() {
  const {
    authenticatedUser,
    currentSession,
    sessionSettings,
    logout,
    fetchCurrentSession,
    loadSessionSettings,
    invalidateSessionRecreation,
  } = useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);

  const hasHistory = (sessionSettings?.session_history.length ?? 0) > 0;

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
    logUserAction('User logout initiated');
    await logout();
    logNavigation('Home View', '/');
    void navigate('/');
  };

  const handleLogout = async () => {
    setTouchedButton(null);
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

  const handleStartActivity = () => {
    logNavigation('Home View', '/activity-selection');
    void navigate('/activity-selection');
  };

  const handleSessionHistory = () => {
    setTouchedButton(null);
    logNavigation('Home View', '/session-history');
    void navigate('/session-history');
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

  const handleStaffClock = () => {
    setTouchedButton(null);
    logNavigation('Home View', '/staff-clock');
    void navigate('/staff-clock');
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
              // Neutral white pill with gray icon/text (design-review v2)
              backgroundColor:
                touchedButton === 'tag' ? designSystem.gray[100] : designSystem.colors.white,
              border: `1px solid ${designSystem.gray[200]}`,
              borderRadius: '34px',
              cursor: 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              boxShadow: designSystem.shadows.sm,
              transform: touchedButton === 'tag' ? designSystem.scales.activeSmall : 'scale(1)',
            }}
          >
            <ContactlessPaymentIcon size={28} color={designSystem.gray[700]} />
            <span
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: designSystem.gray[700],
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
            onTouchStart={() => setTouchedButton('logout')}
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
                touchedButton === 'logout' ? designSystem.pastel.red.bg : designSystem.colors.white,
              border: `1px solid ${designSystem.pastel.red.accent}`,
              borderRadius: '34px',
              cursor: 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              boxShadow: designSystem.shadows.sm,
              transform: touchedButton === 'logout' ? designSystem.scales.activeSmall : 'scale(1)',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke={designSystem.pastel.red.accent}
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
                color: designSystem.pastel.red.accent,
              }}
            >
              {currentSession ? texts.endSessionButton : texts.logoutButton}
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
                  cursor: 'pointer',
                }}
              >
                {/* Content */}
                <div>
                  <div
                    style={{
                      width: '88px',
                      height: '88px',
                      backgroundColor: designSystem.brand.greenTint,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    {getActivityIcon(currentSession)}
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
                    {getActivityHeading(currentSession)}
                  </h3>
                  <p
                    style={{
                      fontSize: '18px',
                      color: designSystem.gray[500],
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    {getActivitySubtitle(currentSession)}
                  </p>
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
                      backgroundColor: designSystem.gray[100],
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={designSystem.gray[500]}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
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

            <button
              type="button"
              onClick={handleStaffClock}
              onTouchStart={() => setTouchedButton('staff-clock')}
              onTouchEnd={() => setTouchedButton(null)}
              onTouchCancel={() => setTouchedButton(null)}
              style={{
                width: '100%',
                minHeight: '148px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '24px',
                padding: '28px 36px',
                backgroundColor: '#FFFFFF',
                border: '2px solid #E5E7EB',
                borderRadius: '28px',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 300ms ease-out',
                transform: touchedButton === 'staff-clock' ? 'scale(0.98)' : 'scale(1)',
                boxShadow:
                  touchedButton === 'staff-clock'
                    ? '0 4px 12px rgba(0, 0, 0, 0.1)'
                    : '0 8px 30px rgba(0, 0, 0, 0.12)',
              }}
            >
              <span
                style={{
                  width: '76px',
                  height: '76px',
                  borderRadius: '50%',
                  backgroundColor: designSystem.brand.bluePillBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-hidden="true"
              >
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={designSystem.brand.blue}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <span style={{ textAlign: 'left' }}>
                <span
                  style={{ display: 'block', fontSize: '28px', fontWeight: 700, color: '#1F2937' }}
                >
                  Mitarbeiter-Stempeln
                </span>
                <span
                  style={{ display: 'block', marginTop: '4px', fontSize: '18px', color: '#6B7280' }}
                >
                  Ein- und ausstempeln oder Pause erfassen
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* History shortcut - bottom left, same spot as the former panel */}
        {!currentSession && hasHistory && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '20px',
              zIndex: 30,
            }}
          >
            <button
              type="button"
              onClick={handleSessionHistory}
              onTouchStart={() => setTouchedButton('history')}
              onTouchEnd={() => setTouchedButton(null)}
              onTouchCancel={() => setTouchedButton(null)}
              onPointerLeave={() =>
                setTouchedButton(current => (current === 'history' ? null : current))
              }
              style={{
                height: '68px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '0 32px',
                backgroundColor:
                  touchedButton === 'history' ? designSystem.gray[100] : designSystem.colors.white,
                border: `1px solid ${designSystem.gray[200]}`,
                borderRadius: '34px',
                cursor: 'pointer',
                transition: designSystem.transitions.base,
                outline: 'none',
                boxShadow: designSystem.shadows.sm,
                transform:
                  touchedButton === 'history' ? designSystem.scales.activeSmall : 'scale(1)',
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
                {texts.historyButton}
              </span>
            </button>
          </div>
        )}
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
          // destructive end-session → unified modal red (#CC2626), §4b
          confirmGradient={designSystem.flat.danger}
        />
      </ModalBase>
    </BackgroundWrapper>
  );
}

export default HomeViewPage;
