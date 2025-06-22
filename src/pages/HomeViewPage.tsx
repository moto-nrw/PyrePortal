import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { logNavigation, logUserAction } from '../utils/logger';

/**
 * Home View Page - Main dashboard with four action buttons
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

  // Action card component
  const ActionCard: React.FC<{
    onClick: () => void;
    title: string;
    icon: string;
    disabled?: boolean;
  }> = ({ onClick, title, icon, disabled = false }) => {
    const cardStyles: React.CSSProperties = {
      backgroundColor: disabled ? '#f3f4f6' : theme.colors.background.light,
      borderRadius: theme.borders.radius.lg,
      boxShadow: theme.shadows.md,
      padding: theme.spacing.xl,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: theme.animation.transition.fast,
      border: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '180px',
      opacity: disabled ? 0.6 : 1,
    };

    return (
      <div
        onClick={disabled ? undefined : onClick}
        style={cardStyles}
        className={disabled ? '' : 'hover:bg-gray-100 hover:shadow-lg active:bg-gray-200'}
      >
        <div style={{ fontSize: '3.5rem', marginBottom: theme.spacing.lg }}>{icon}</div>
        <div
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            color: disabled ? theme.colors.text.secondary : theme.colors.text.primary,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
      </div>
    );
  };

  return (
    <ContentBox centered shadow="md" rounded="lg" padding={theme.spacing.xl}>
      <div style={{ width: '100%', maxWidth: '600px' }}>
        {/* User info section */}
        <div style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.md,
              color: theme.colors.text.primary,
            }}
          >
            {authenticatedUser.staffName}
          </h1>
          <p
            style={{
              fontSize: '1.5rem',
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
            }}
          >
            Gerät: {authenticatedUser.deviceName}
          </p>
        </div>

        {/* Action cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: theme.spacing.lg,
            width: '100%',
          }}
        >
          <ActionCard onClick={handleTagAssignment} title="Armband scannen" icon="📱" />
          {currentSession ? (
            <ActionCard
              onClick={handleContinueActivity}
              title={
                currentSession.activity_name
                  ? `${currentSession.activity_name} fortsetzen`
                  : 'Aktivität fortsetzen'
              }
              icon="▶️"
            />
          ) : (
            <ActionCard onClick={handleStartActivity} title="Aktivität starten" icon="🎯" />
          )}
          <ActionCard onClick={handleAttendance} title="Anwesenheit" icon="🏠" />
          <ActionCard onClick={handleLogout} title="Abmelden" icon="🚪" />
        </div>
      </div>
    </ContentBox>
  );
}

export default HomeViewPage;
