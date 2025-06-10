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
  const { authenticatedUser, logout } = useUserStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logUserAction('User logout initiated');
    logout();
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

  const handleSettings = () => {
    // Skip for MVP according to documentation
    logUserAction('Settings clicked (MVP - skipped)');
  };

  // Redirect to login if no authenticated user
  React.useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Home View', '/');
      void navigate('/');
    }
  }, [authenticatedUser, navigate]);

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
      padding: theme.spacing.xxl,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: theme.animation.transition.fast,
      border: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '250px',
      opacity: disabled ? 0.6 : 1,
    };

    return (
      <div
        onClick={disabled ? undefined : onClick}
        style={cardStyles}
        className={disabled ? '' : 'hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg'}
      >
        <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>
          {icon}
        </div>
        <div
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            color: disabled ? theme.colors.text.secondary : theme.colors.text.primary,
            textAlign: 'center',
          }}
        >
          {title}
        </div>
      </div>
    );
  };

  return (
    <ContentBox centered shadow="md" rounded="lg">
      <div style={{ width: '100%', maxWidth: '600px' }}>
        {/* User info section */}
        <div style={{ textAlign: 'center', marginBottom: theme.spacing.xxl }}>
          <h1
            style={{
              fontSize: theme.fonts.size.xxl,
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.primary,
            }}
          >
            {authenticatedUser.staffName}
          </h1>
          <p
            style={{
              fontSize: theme.fonts.size.large,
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
            gap: theme.spacing.xl,
            width: '100%',
          }}
        >
          <ActionCard
            onClick={handleTagAssignment}
            title="Armband scannen"
            icon="📱"
          />
          <ActionCard
            onClick={handleStartActivity}
            title="Aktivität starten"
            icon="🎯"
          />
          <ActionCard
            onClick={handleSettings}
            title="Einstellungen"
            icon="⚙️"
            disabled={true}
          />
          <ActionCard
            onClick={handleLogout}
            title="Abmelden"
            icon="🚪"
          />
        </div>
      </div>
    </ContentBox>
  );
}

export default HomeViewPage;