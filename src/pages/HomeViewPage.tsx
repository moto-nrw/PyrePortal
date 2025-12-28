import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { LastSessionToggle } from '../components/LastSessionToggle';
import { ErrorModal, ModalBase } from '../components/ui';
import { useHomeViewHandlers } from '../hooks/useHomeViewHandlers';
import type { CurrentSession } from '../services/api';
import type { SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { logNavigation } from '../utils/logger';

// ============================================================================
// Pure helper functions (UI-related, kept in component file)
// ============================================================================

/** Get appropriate activity icon based on session state */
function getActivityIcon(
  currentSession: CurrentSession | null,
  sessionSettings: SessionSettings | null
): React.ReactNode {
  if (currentSession) {
    return (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="#83cd2d" stroke="none">
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
        stroke="#83cd2d"
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
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#83cd2d" strokeWidth="2.5">
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
    return currentSession.activity_name ?? 'Aktivität';
  }
  if (sessionSettings?.use_last_session && sessionSettings.last_session) {
    return 'Aktivität wiederholen';
  }
  return 'Neue Aktivität';
}

/** Get activity subtitle text based on session state */
function getActivitySubtitle(
  currentSession: CurrentSession | null,
  sessionSettings: SessionSettings | null
): string {
  if (currentSession) {
    return 'Fortsetzen';
  }
  if (sessionSettings?.use_last_session && sessionSettings.last_session) {
    return sessionSettings.last_session.activity_name;
  }
  return 'Starten';
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
    return `${selectedSupervisorsCount} Betreuer (gespeichert: ${savedCount})`;
  }
  if (selectedSupervisorsCount > 0) {
    return `${selectedSupervisorsCount} Betreuer`;
  }
  return `${savedCount} Betreuer`;
}

/** Create touch start handler for glass-style buttons */
function createTouchStartHandler(
  activeBackgroundColor: string,
  isEnabled = true
): (e: React.TouchEvent<HTMLButtonElement>) => void {
  return (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isEnabled) return;
    e.currentTarget.style.transform = designSystem.scales.activeSmall;
    e.currentTarget.style.backgroundColor = activeBackgroundColor;
    e.currentTarget.style.boxShadow = designSystem.shadows.button;
  };
}

/** Create touch end handler for glass-style buttons */
function createTouchEndHandler(
  defaultBackgroundColor: string,
  isEnabled = true
): (e: React.TouchEvent<HTMLButtonElement>) => void {
  return (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isEnabled) return;
    const target = e.currentTarget;
    setTimeout(() => {
      if (target) {
        target.style.transform = 'scale(1)';
        target.style.backgroundColor = defaultBackgroundColor;
        target.style.boxShadow = designSystem.shadows.button;
      }
    }, 150);
  };
}

// ============================================================================
// Component
// ============================================================================

function HomeViewPage() {
  const {
    authenticatedUser,
    currentSession,
    selectedSupervisors,
    sessionSettings,
    loadSessionSettings,
    fetchCurrentSession,
    isValidatingLastSession,
  } = useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Memoize modal state object to prevent unnecessary re-renders
  const modalState = useMemo(
    () => ({
      setShowErrorModal,
      setErrorMessage,
      setShowConfirmModal,
    }),
    []
  );

  // Use extracted handlers hook (reduces cognitive complexity)
  const {
    handleLogout,
    handleTagAssignment,
    handleStartActivity,
    handleContinueActivity,
    handleTeamManagement,
    handleConfirmRecreation,
  } = useHomeViewHandlers(modalState);

  // Check if supervisors are selected
  const hasSupervisors = selectedSupervisors.length > 0;

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

  // Extract first name from full name (unused for now)
  // const firstName = authenticatedUser.staffName.split(' ')[0];

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
            style={{
              height: '68px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '0 32px',
              backgroundColor: hasSupervisors
                ? designSystem.glass.background
                : 'rgba(255, 255, 255, 0.6)',
              border: hasSupervisors
                ? '1px solid rgba(80, 128, 216, 0.2)'
                : '1px solid rgba(156, 163, 175, 0.2)',
              borderRadius: '34px',
              cursor: hasSupervisors ? 'pointer' : 'not-allowed',
              transition: designSystem.transitions.base,
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: hasSupervisors
                ? designSystem.shadows.button
                : '0 2px 6px rgba(0, 0, 0, 0.1)',
              backdropFilter: designSystem.glass.blur,
              WebkitBackdropFilter: designSystem.glass.blur,
              opacity: hasSupervisors ? 1 : 0.6,
            }}
            onTouchStart={createTouchStartHandler('rgba(80, 128, 216, 0.1)', hasSupervisors)}
            onTouchEnd={createTouchEndHandler(designSystem.glass.background, hasSupervisors)}
          >
            <FontAwesomeIcon
              icon={faWifi}
              size="xl"
              style={{ color: hasSupervisors ? '#5080D8' : '#9CA3AF', transform: 'rotate(90deg)' }}
            />
            <span
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: hasSupervisors ? '#5080D8' : '#9CA3AF',
              }}
            >
              NFC-Scan
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
            style={{
              height: '68px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '0 32px',
              backgroundColor: designSystem.glass.background,
              border: '1px solid rgba(255, 49, 48, 0.2)',
              borderRadius: '34px',
              cursor: 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: designSystem.shadows.button,
              backdropFilter: designSystem.glass.blur,
              WebkitBackdropFilter: designSystem.glass.blur,
            }}
            onTouchStart={createTouchStartHandler('rgba(255, 49, 48, 0.1)')}
            onTouchEnd={createTouchEndHandler(designSystem.glass.background)}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FF3130"
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
                color: '#FF3130',
              }}
            >
              {currentSession ? 'Aktivität Beenden' : 'Abmelden'}
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
              color: '#111827',
              lineHeight: 1.2,
            }}
          >
            Menü
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
                  backgroundColor: '#FFFFFF',
                  border: '2px solid #E5E7EB',
                  borderRadius: '28px',
                  padding: '36px',
                  transition: 'all 300ms ease-out',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'activity' ? 'scale(0.98)' : 'scale(1)',
                  boxShadow:
                    touchedButton === 'activity'
                      ? '0 4px 12px rgba(0, 0, 0, 0.1)'
                      : '0 8px 30px rgba(0, 0, 0, 0.12)',
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
                      backgroundColor: '#EFF9E5',
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
                      fontWeight: 700,
                      color: '#1F2937',
                      margin: '0 0 8px 0',
                      textAlign: 'center',
                    }}
                  >
                    {getActivityHeading(currentSession, sessionSettings)}
                  </h3>
                  <p
                    style={{
                      fontSize: '18px',
                      color: '#6B7280',
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
                              backgroundColor: '#E0E7FF',
                              color: '#4C1D95',
                              padding: '4px 12px',
                              borderRadius: '9999px',
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
                            {sessionSettings.last_session.room_name}
                          </span>
                          <span
                            style={{
                              fontSize: '13px',
                              backgroundColor: '#D1FAE5',
                              color: '#065F46',
                              padding: '4px 12px',
                              borderRadius: '9999px',
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
                  backgroundColor: '#FFFFFF',
                  border: '2px solid #E5E7EB',
                  borderRadius: '28px',
                  padding: '36px',
                  cursor: 'pointer',
                  transition: 'all 300ms ease-out',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'team' ? 'scale(0.98)' : 'scale(1)',
                  boxShadow:
                    touchedButton === 'team'
                      ? '0 4px 12px rgba(0, 0, 0, 0.1)'
                      : '0 8px 30px rgba(0, 0, 0, 0.12)',
                }}
              >
                {/* Content */}
                <div>
                  <div
                    style={{
                      width: '88px',
                      height: '88px',
                      backgroundColor: '#EDE9FE',
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
                      stroke="#9333EA"
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
                      fontWeight: 700,
                      color: '#1F2937',
                      margin: '0 0 8px 0',
                      textAlign: 'center',
                    }}
                  >
                    Team anpassen
                  </h3>
                  <p
                    style={{
                      fontSize: '18px',
                      color: '#6B7280',
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    Betreuer verwalten
                  </p>
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
        backgroundColor="#FFFFFF"
        closeOnBackdropClick={!isValidatingLastSession}
      >
        {/* Success Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(to right, #83CD2D, #70B525)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: '0 8px 32px rgba(131, 205, 45, 0.3)',
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
            fontWeight: 700,
            color: '#1F2937',
            marginBottom: '12px',
          }}
        >
          Aktivität wiederholen?
        </h2>

        {/* Activity Details */}
        {useUserStore.getState().selectedActivity && useUserStore.getState().selectedRoom && (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '16px',
              }}
            >
              {useUserStore.getState().selectedActivity?.name}
            </div>

            <div
              style={{
                backgroundColor: '#F3F4F6',
                borderRadius: designSystem.borderRadius.lg,
                padding: '16px',
                textAlign: 'left',
              }}
            >
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Raum:</span>
                <span
                  style={{
                    color: '#1F2937',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginLeft: '8px',
                  }}
                >
                  {useUserStore.getState().selectedRoom?.name}
                </span>
              </div>
              <div>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Betreuer:</span>
                <span
                  style={{
                    color: '#1F2937',
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

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => setShowConfirmModal(false)}
            style={{
              flex: 1,
              height: '68px',
              fontSize: '18px',
              fontWeight: 600,
              color: '#6B7280',
              backgroundColor: 'transparent',
              border: '2px solid #E5E7EB',
              borderRadius: designSystem.borderRadius.lg,
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
            }}
          >
            Abbrechen
          </button>

          <button
            onClick={handleConfirmRecreation}
            disabled={isValidatingLastSession}
            style={{
              flex: 1,
              height: '68px',
              fontSize: '18px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: isValidatingLastSession
                ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                : 'linear-gradient(to right, #83CD2D, #70B525)',
              border: 'none',
              borderRadius: designSystem.borderRadius.lg,
              cursor: isValidatingLastSession ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              boxShadow: isValidatingLastSession ? 'none' : '0 4px 14px 0 rgba(131, 205, 45, 0.4)',
              opacity: isValidatingLastSession ? 0.6 : 1,
            }}
          >
            {isValidatingLastSession ? 'Starte...' : 'Aktivität starten'}
          </button>
        </div>
      </ModalBase>
    </BackgroundWrapper>
  );
}

export default HomeViewPage;
