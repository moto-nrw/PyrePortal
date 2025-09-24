import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { LastSessionToggle } from '../components/LastSessionToggle';
import { ContentBox, ErrorModal } from '../components/ui';
import { api, type SessionStartRequest } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { logNavigation, logUserAction } from '../utils/logger';

/**
 * Home View Page - Modern tablet-optimized dashboard
 * Displays after successful PIN validation
 */
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
    isValidatingLastSession
  } = useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  const handleStartActivity = async () => {
    // Check if we should recreate last session
    if (sessionSettings?.use_last_session && sessionSettings.last_session) {
      logUserAction('Attempting to recreate last session');
      const success = await validateAndRecreateSession();
      
      if (success) {
        // Show confirmation modal with session details
        setShowConfirmModal(true);
      }
    } else {
      // Normal flow
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
  
  const handleConfirmRecreation = async () => {
    if (!authenticatedUser || !sessionSettings?.last_session) return;
    
    try {
      const { selectedActivity, selectedRoom, selectedSupervisors } = useUserStore.getState();
      
      if (!selectedActivity || !selectedRoom || selectedSupervisors.length === 0) {
        setErrorMessage('Fehler bei der Validierung der gespeicherten Sitzung');
        setShowErrorModal(true);
        setShowConfirmModal(false);
        return;
      }
      
      logUserAction('Confirming session recreation', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
        supervisorCount: selectedSupervisors.length,
      });
      
      // Start the session
      const sessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id,
        supervisor_ids: selectedSupervisors.map(s => s.id),
      };
      
      const sessionResponse = await api.startSession(authenticatedUser.pin, sessionRequest);
      
      logUserAction('Session recreated successfully', {
        sessionId: sessionResponse.active_group_id,
      });
      
      // Save the new session data
      await useUserStore.getState().saveLastSessionData();
      
      // Fetch current session to update state
      await fetchCurrentSession();
      
      // Navigate to NFC scanning
      logNavigation('Home View', '/nfc-scanning');
      void navigate('/nfc-scanning');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Fehler beim Starten der Aktivität';
      setErrorMessage(errorMsg);
      setShowErrorModal(true);
    } finally {
      setShowConfirmModal(false);
    }
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
                disabled={isValidatingLastSession}
                style={{
                  position: 'relative',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: designSystem.borderRadius.xl,
                  padding: '32px',
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
                  opacity: isValidatingLastSession ? 0.7 : 1,
                  cursor: isValidatingLastSession ? 'not-allowed' : 'pointer',
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
                      : sessionSettings?.use_last_session && sessionSettings.last_session
                      ? 'Aktivität wiederholen'
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
                    {currentSession 
                      ? 'Fortsetzen' 
                      : sessionSettings?.use_last_session && sessionSettings.last_session
                      ? sessionSettings.last_session.activity_name
                      : 'Starten'}
                  </p>
                  
                  {/* Show room and supervisor info for saved session */}
                  {!currentSession && sessionSettings?.use_last_session && sessionSettings.last_session && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{
                          fontSize: '13px',
                          backgroundColor: '#E0E7FF',
                          color: '#4C1D95',
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          📍 {sessionSettings.last_session.room_name}
                        </span>
                        <span style={{
                          fontSize: '13px',
                          backgroundColor: '#D1FAE5',
                          color: '#065F46',
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          👥 {selectedSupervisors.length > 0 && selectedSupervisors.length !== sessionSettings.last_session.supervisor_names.length
                            ? `${selectedSupervisors.length} Betreuer (gespeichert: ${sessionSettings.last_session.supervisor_names.length})`
                            : selectedSupervisors.length > 0
                            ? `${selectedSupervisors.length} Betreuer`
                            : `${sessionSettings.last_session.supervisor_names.length} Betreuer`
                          }
                        </span>
                      </div>
                    </div>
                  )}
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
      {showConfirmModal && sessionSettings?.last_session && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfirmModal(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: designSystem.borderRadius.xl,
              padding: '32px',
              maxWidth: '480px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              position: 'relative',
              overflow: 'hidden',
            }}
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
                    <span style={{ color: '#1F2937', fontSize: '14px', fontWeight: 500, marginLeft: '8px' }}>
                      {useUserStore.getState().selectedRoom?.name}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280', fontSize: '14px' }}>Betreuer:</span>
                    <span style={{ color: '#1F2937', fontSize: '14px', fontWeight: 500, marginLeft: '8px' }}>
                      {useUserStore.getState().selectedSupervisors.map(s => s.name).join(', ')}
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
                  height: '48px',
                  fontSize: '16px',
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
                  height: '48px',
                  fontSize: '16px',
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
          </div>
        </div>
      )}
      
    </ContentBox>
  );
}

export default HomeViewPage;
