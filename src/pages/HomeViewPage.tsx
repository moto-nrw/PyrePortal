import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { logNavigation, logUserAction } from '../utils/logger';

/**
 * Home View Page - Modern tablet-optimized dashboard
 * Displays after successful PIN validation
 */
function HomeViewPage() {
  const { authenticatedUser, currentSession, logout, fetchCurrentSession } = useUserStore();
  const navigate = useNavigate();
  const [touchedButton, setTouchedButton] = useState<string | null>(null);

  const handleLogout = async () => {
    logUserAction('User logout initiated');
    await logout();
    logNavigation('Home View', '/');
    void navigate('/');
  };

  const handleTagAssignment = () => {
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

  // Extract first name from full name
  const firstName = authenticatedUser.staffName.split(' ')[0];

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div style={{ 
        width: '100%', 
        height: '100%',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
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
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid rgba(255, 49, 48, 0.2)',
              borderRadius: '28px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              backdropFilter: 'blur(8px)',
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 49, 48, 0.1)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
            }}
            onTouchEnd={(e) => {
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#FF3130',
              }}
            >
              Abmelden
            </span>
          </button>
        </div>

        {/* Welcome Header */}
        <div style={{ 
          textAlign: 'center',
          marginBottom: '32px',
        }}>
          <div
            style={{
              width: '100px',
              height: '100px',
              background: 'linear-gradient(135deg, #5080D8, #3f6bc4)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(80, 128, 216, 0.3)',
            }}
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          
          <h1
            style={{
              fontSize: '48px',
              fontWeight: theme.fonts.weight.bold,
              margin: 0,
              color: theme.colors.text.primary,
              lineHeight: 1.2,
            }}
          >
            Hallo, {firstName}!
          </h1>
          <p
            style={{
              fontSize: '20px',
              color: theme.colors.text.secondary,
              margin: '8px 0 0 0',
              fontWeight: 500,
            }}
          >
            Was möchten Sie heute tun?
          </p>
        </div>

        {/* Main Content - Centered */}
        <div style={{ 
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: '600px' }}>
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
                  borderRadius: '20px',
                  padding: '32px',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'activity' ? 'scale(0.97)' : 'scale(1)',
                }}
              >
                {/* Gradient border */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, #83cd2d, #6ba529)',
                    zIndex: 0,
                  }}
                />
                
                {/* Inner content */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '3px',
                    borderRadius: '17px',
                    background: 'linear-gradient(to bottom, #FFFFFF, #F7FEF1)',
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
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#83cd2d" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polygon points="10,8 16,12 10,16" fill="#83cd2d"/>
                      </svg>
                    ) : (
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#83cd2d" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
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
                    {currentSession ? currentSession.activity_name ?? 'Aktivität' : 'Neue Aktivität'}
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

              {/* NFC Scan Button */}
              <button
                onClick={handleTagAssignment}
                onTouchStart={() => setTouchedButton('nfc')}
                onTouchEnd={() => setTouchedButton(null)}
                style={{
                  position: 'relative',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '32px',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  transform: touchedButton === 'nfc' ? 'scale(0.97)' : 'scale(1)',
                }}
              >
                {/* Gradient border */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, #5080D8, #3f6bc4)',
                    zIndex: 0,
                  }}
                />
                
                {/* Inner content */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '3px',
                    borderRadius: '17px',
                    background: 'linear-gradient(to bottom, #FFFFFF, #EFF6FF)',
                    zIndex: 1,
                  }}
                />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#E6EFFF',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <FontAwesomeIcon 
                      icon={faWifi} 
                      size="3x"
                      style={{ color: '#5080D8', transform: 'rotate(90deg)' }}
                    />
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
                    NFC-Scan
                  </h3>
                  <p
                    style={{
                      fontSize: '16px',
                      color: '#6B7280',
                      margin: 0,
                      textAlign: 'center',
                    }}
                  >
                    Armband einlesen
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
    </ContentBox>
  );
}

export default HomeViewPage;