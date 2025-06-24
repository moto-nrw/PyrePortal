import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import { logNavigation, logUserAction } from '../utils/logger';

/**
 * Home View Page - Modern tablet-optimized dashboard
 * Displays after successful PIN validation
 */
function HomeViewPage() {
  const { authenticatedUser, currentSession, logout, fetchCurrentSession } = useUserStore();
  const navigate = useNavigate();

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

  const handleAttendance = () => {
    logNavigation('Home View', '/attendance');
    void navigate('/attendance');
  };

  // Redirect to login if no authenticated user and fetch current session
  React.useEffect(() => {
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

  // Primary action card component
  const PrimaryActionCard: React.FC<{
    onClick: () => void;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    disabled?: boolean;
    variant?: 'primary' | 'continue' | 'activity';
  }> = ({ onClick, title, subtitle, icon, disabled = false, variant = 'primary' }) => {
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '16px',
          padding: '24px 32px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          position: 'relative',
          overflow: 'hidden',
          height: '180px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          WebkitTapHighlightColor: 'transparent',
          opacity: disabled ? 0.6 : 1,
          flex: 1,
        }}
        onTouchStart={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'scale(0.97)';
            e.currentTarget.style.backgroundColor = '#F0FDFA';
          }
        }}
        onTouchEnd={(e) => {
          if (!disabled) {
            setTimeout(() => {
              if (e.currentTarget) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }, 150);
          }
        }}
      >
        {/* Gradient border wrapper */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '16px',
            background: variant === 'continue'
              ? 'linear-gradient(to right, #10B981, #059669)'
              : variant === 'activity'
              ? 'linear-gradient(to right, #83cd2d, #6ba529)'
              : 'linear-gradient(to right, #14B8A6, #3B82F6)',
            zIndex: 0,
          }}
        />
        
        {/* Inner content wrapper */}
        <div
          style={{
            position: 'absolute',
            inset: '3px',
            borderRadius: '13px',
            background: variant === 'continue'
              ? 'linear-gradient(to bottom, #FFFFFF, #F7FDF9)'
              : variant === 'activity'
              ? 'linear-gradient(to bottom, #FFFFFF, #F0FDF4)'
              : 'linear-gradient(to bottom, #FFFFFF, #F8FCFF)',
            zIndex: 1,
          }}
        />
        
        {/* Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              color: variant === 'continue' 
                ? '#10B981' 
                : variant === 'activity'
                ? '#83cd2d'
                : '#14B8A6',
            }}
          >
            {icon}
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h3
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#1F2937',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  fontSize: '16px',
                  color: '#6B7280',
                  margin: '6px 0 0 0',
                  lineHeight: 1.3,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </button>
    );
  };

  // Secondary action button component
  const SecondaryActionButton: React.FC<{
    onClick: () => void;
    title: string;
    icon: React.ReactNode;
    variant?: 'secondary' | 'danger';
  }> = ({ onClick, title, icon, variant = 'secondary' }) => {
    return (
      <button
        onClick={onClick}
        style={{
          backgroundColor: 'transparent',
          border: `2px solid ${variant === 'danger' ? '#FF3130' : '#E5E7EB'}`,
          borderRadius: '12px',
          padding: '16px 24px',
          cursor: 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.transform = 'scale(0.98)';
          e.currentTarget.style.backgroundColor = variant === 'danger' ? '#FF313010' : '#F9FAFB';
        }}
        onTouchEnd={(e) => {
          setTimeout(() => {
            if (e.currentTarget) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }, 150);
        }}
      >
        <div
          style={{
            color: variant === 'danger' ? '#FF3130' : '#6B7280',
          }}
        >
          {icon}
        </div>
        
        <span
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: variant === 'danger' ? '#FF3130' : '#374151',
          }}
        >
          {title}
        </span>
      </button>
    );
  };

  // Icon components with better semantic meaning
  const NFCScanIcon = () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* Three NFC lines */}
      <path d="M9 12a3 3 0 1 1 6 0"/>
      <path d="M6 12a6 6 0 1 1 12 0"/>
      <path d="M3 12a9 9 0 1 1 18 0"/>
    </svg>
  );

  const ActivityStartIcon = () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );

  const ActivityContinueIcon = () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="10,8 16,12 10,16"/>
    </svg>
  );

  const AttendanceIcon = () => (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <path d="M8 14h.01"/>
      <path d="M12 14h.01"/>
      <path d="M16 14h.01"/>
      <path d="M8 18h.01"/>
      <path d="M12 18h.01"/>
    </svg>
  );

  const DeviceLogoutIcon = () => (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M6 8h.01"/>
      <path d="M10 8h.01"/>
      <path d="M14 8h.01"/>
      <path d="M16 12l-4 4-4-4"/>
      <path d="M12 16V8"/>
    </svg>
  );

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding="16px">
      <div style={{ width: '100%', maxWidth: '700px' }}>
        {/* User welcome section */}
        <div 
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(20, 184, 166, 0.3)',
              marginRight: '16px',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          
          <div>
            <h1
              style={{
                fontSize: '42px',
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.1,
                background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Hallo, {firstName}!
            </h1>
          </div>
        </div>

        {/* Primary actions - Main workflow */}
        <div 
          style={{
            marginBottom: '32px',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#374151',
              margin: '0 0 20px 0',
              textAlign: 'left',
            }}
          >
            Hauptaktionen
          </h2>
          
          <div
            style={{
              display: 'flex',
              gap: '16px',
              width: '100%',
            }}
          >
            {currentSession ? (
              <PrimaryActionCard
                onClick={handleContinueActivity}
                title={currentSession.activity_name ?? 'Aktivität'}
                subtitle="Fortsetzen"
                icon={<ActivityContinueIcon />}
                variant="continue"
              />
            ) : (
              <PrimaryActionCard
                onClick={handleStartActivity}
                title="Neue Aktivität"
                subtitle="Aktivität starten"
                icon={<ActivityStartIcon />}
                variant="activity"
              />
            )}
            
            <PrimaryActionCard
              onClick={handleTagAssignment}
              title="NFC-Scan"
              subtitle="Armband einlesen"
              icon={<NFCScanIcon />}
            />
          </div>
        </div>

        {/* Secondary actions */}
        <div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#374151',
              margin: '0 0 20px 0',
              textAlign: 'left',
            }}
          >
            Weitere Optionen
          </h2>
          
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <SecondaryActionButton
              onClick={handleAttendance}
              title="Anwesenheit verwalten"
              icon={<AttendanceIcon />}
            />
            
            <SecondaryActionButton
              onClick={handleLogout}
              title="Gerät abmelden"
              icon={<DeviceLogoutIcon />}
              variant="danger"
            />
          </div>
        </div>
      </div>
    </ContentBox>
  );
}

export default HomeViewPage;