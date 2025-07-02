import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { logNavigation, logUserAction } from '../utils/logger';

/**
 * Home View Page - Modern tablet-optimized dashboard
 * Displays after successful PIN validation
 */
function HomeViewPage() {
  const { authenticatedUser, currentSession, logout, fetchCurrentSession, selectedSupervisors } =
    useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Check if supervisors are selected
  const hasSupervisors = selectedSupervisors.length > 0;

  const handleLogout = async () => {
    if (currentSession) {
      // End the current session
      logUserAction('Ending current session');
      try {
        await api.endSession(authenticatedUser!.pin);
        await fetchCurrentSession(); // Refresh session state
        logUserAction('Session ended successfully');
      } catch (error) {
        logUserAction('Failed to end session', { error });
      }
    } else {
      // Logout and redirect to landing page
      logUserAction('User logout initiated');
      await logout();
      logNavigation('Home View', '/');
      void navigate('/');
    }
  };

  const handleTagAssignment = () => {
    if (!hasSupervisors) {
      logUserAction('NFC-Scan attempted without supervisors');
      setErrorMessage(
        "Bitte wählen Sie zuerst mindestens einen Betreuer über 'Team anpassen' aus, bevor Sie die NFC-Scan Funktion nutzen können."
      );
      setShowErrorModal(true);
      return;
    }
    logNavigation('Home View', '/tag-assignment');
    void navigate('/tag-assignment');
  };

  const handleStartActivity = () => {
    logNavigation('Home View', '/activity-selection');
    void navigate('/activity-selection');
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

  // Redirect to login if no authenticated user and fetch current session
  useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Home View', '/');
      void navigate('/');
      return;
    }

    // Check for existing session when component mounts
    void fetchCurrentSession();
  }, [authenticatedUser, navigate, fetchCurrentSession]);

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  // Extract first name from full name (unused for now)
  // const firstName = authenticatedUser.staffName.split(' ')[0];

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* NFC Scan button - Top Left */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleTagAssignment}
            style={{
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 28px',
              backgroundColor: hasSupervisors
                ? designSystem.glass.background
                : 'rgba(255, 255, 255, 0.6)',
              border: hasSupervisors
                ? '1px solid rgba(80, 128, 216, 0.2)'
                : '1px solid rgba(156, 163, 175, 0.2)',
              borderRadius: '28px',
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
            onTouchStart={e => {
              if (hasSupervisors) {
                e.currentTarget.style.transform = designSystem.scales.activeSmall;
                e.currentTarget.style.backgroundColor = 'rgba(80, 128, 216, 0.1)';
                e.currentTarget.style.boxShadow = designSystem.shadows.button;
              }
            }}
            onTouchEnd={e => {
              if (hasSupervisors) {
                setTimeout(() => {
                  if (e.currentTarget) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = designSystem.glass.background;
                    e.currentTarget.style.boxShadow = designSystem.shadows.button;
                  }
                }, 150);
              }
            }}
          >
            <FontAwesomeIcon
              icon={faWifi}
              size="lg"
              style={{ color: hasSupervisors ? '#5080D8' : '#9CA3AF', transform: 'rotate(90deg)' }}
            />
            <span
              style={{
                fontSize: '18px',
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
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleLogout}
            style={{
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 28px',
              backgroundColor: designSystem.glass.background,
              border: '1px solid rgba(255, 49, 48, 0.2)',
              borderRadius: '28px',
              cursor: 'pointer',
              transition: designSystem.transitions.base,
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: designSystem.shadows.button,
              backdropFilter: designSystem.glass.blur,
              WebkitBackdropFilter: designSystem.glass.blur,
            }}
            onTouchStart={e => {
              e.currentTarget.style.transform = designSystem.scales.activeSmall;
              e.currentTarget.style.backgroundColor = 'rgba(255, 49, 48, 0.1)';
              e.currentTarget.style.boxShadow = designSystem.shadows.button;
            }}
            onTouchEnd={e => {
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = designSystem.glass.background;
                  e.currentTarget.style.boxShadow = designSystem.shadows.button;
                }
              }, 150);
            }}
          >
            <svg
              width="24"
              height="24"
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
                fontSize: '18px',
                fontWeight: 600,
                color: '#FF3130',
              }}
            >
              {currentSession ? 'Aktivität Beenden' : 'Abmelden'}
            </span>
          </button>
        </div>

        {/* Welcome Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '32px',
          }}
        >
          <h1
            style={{
              fontSize: '48px',
              fontWeight: theme.fonts.weight.bold,
              margin: 0,
              color: theme.colors.text.primary,
              lineHeight: 1.2,
            }}
          >
            Menü
          </h1>
        </div>

        {/* Main Content - Centered */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: '720px' }}>
            {/* Primary Actions Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '20px',
                marginBottom: '24px',
              }}
            >
              {/* Activity Button */}
              <button
                onClick={currentSession ? handleContinueActivity : handleStartActivity}
                onTouchStart={() => setTouchedButton('activity')}
                onTouchEnd={() => setTouchedButton(null)}
                style={{
                  position: 'relative',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: designSystem.borderRadius.xl,
                  padding: '32px',
                  cursor: 'pointer',
                  transition: designSystem.transitions.smooth,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '300px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'activity' ? designSystem.scales.active : 'scale(1)',
                  boxShadow: touchedButton === 'activity' ? designSystem.shadows.card : designSystem.shadows.cardHover,
                }}
              >
                {/* Gradient border */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: designSystem.borderRadius.xl,
                    background: designSystem.gradients.green,
                    zIndex: 0,
                  }}
                />

                {/* Inner content */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '3px',
                    borderRadius: `calc(${designSystem.borderRadius.xl} - 3px)`,
                    background: designSystem.gradients.light,
                    backdropFilter: designSystem.glass.blur,
                    WebkitBackdropFilter: designSystem.glass.blur,
                    zIndex: 1,
                  }}
                />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#EFF9E5',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    {currentSession ? (
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#83cd2d"
                        strokeWidth="2.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="10,8 16,12 10,16" fill="#83cd2d" />
                      </svg>
                    ) : (
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#83cd2d"
                        strokeWidth="2.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    )}
                  </div>

                  <h3
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      color: '#1F2937',
                      margin: '0 0 8px 0',
                      textAlign: 'center',
                    }}
                  >
                    {currentSession
                      ? (currentSession.activity_name ?? 'Aktivität')
                      : 'Neue Aktivität'}
                  </h3>
                  <p
                    style={{
                      fontSize: '16px',
                      color: '#6B7280',
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    {currentSession ? 'Fortsetzen' : 'Starten'}
                  </p>
                </div>
              </button>

              {/* Team Management Button */}
              <button
                onClick={handleTeamManagement}
                onTouchStart={() => setTouchedButton('team')}
                onTouchEnd={() => setTouchedButton(null)}
                style={{
                  position: 'relative',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: designSystem.borderRadius.xl,
                  padding: '32px',
                  cursor: 'pointer',
                  transition: designSystem.transitions.smooth,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '300px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'team' ? designSystem.scales.active : 'scale(1)',
                  boxShadow: touchedButton === 'team' ? designSystem.shadows.card : designSystem.shadows.cardHover,
                }}
              >
                {/* Gradient border */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: designSystem.borderRadius.xl,
                    background: 'linear-gradient(135deg, #9333EA, #7C3AED)',
                    zIndex: 0,
                  }}
                />

                {/* Inner content */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '3px',
                    borderRadius: `calc(${designSystem.borderRadius.xl} - 3px)`,
                    background: designSystem.gradients.light,
                    backdropFilter: designSystem.glass.blur,
                    WebkitBackdropFilter: designSystem.glass.blur,
                    zIndex: 1,
                  }}
                />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#EDE9FE',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <svg
                      width="48"
                      height="48"
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
                      fontSize: '24px',
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
                      fontSize: '16px',
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
    </ContentBox>
  );
}

export default HomeViewPage;
