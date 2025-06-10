import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function NFCScanningPage() {
  const {
    authenticatedUser,
    selectedActivity,
    selectedRoom,
    logout,
  } = useUserStore();

  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('NFCScanningPage');

  // Redirect if missing authentication, activity, or room
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to NFCScanningPage');
      logNavigation('NFCScanningPage', '/');
      void navigate('/');
      return;
    }

    if (!selectedActivity) {
      logger.warn('No activity selected, redirecting to activity selection');
      logNavigation('NFCScanningPage', '/activity-selection');
      void navigate('/activity-selection');
      return;
    }

    if (!selectedRoom) {
      logger.warn('No room selected, redirecting to room selection');
      logNavigation('NFCScanningPage', '/rooms');
      void navigate('/rooms');
      return;
    }

    logger.debug('NFCScanningPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
      room: selectedRoom.name,
    });

    return () => {
      logger.debug('NFCScanningPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, selectedRoom, navigate, logger]);

  // Handle logout
  const handleLogout = () => {
    try {
      logger.info('User logging out', { user: authenticatedUser?.staffName });
      logUserAction('logout', { username: authenticatedUser?.staffName });
      logout();
      logNavigation('NFCScanningPage', 'LoginPage');
      void navigate('/');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'NFCScanningPage.handleLogout'
      );
    }
  };

  // Handle back to home
  const handleBackToHome = () => {
    try {
      logger.info('User navigating back to home');
      logNavigation('NFCScanningPage', 'HomeViewPage', { reason: 'back_to_home' });
      void navigate('/home');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'NFCScanningPage.handleBackToHome'
      );
    }
  };

  if (!authenticatedUser || !selectedActivity || !selectedRoom) {
    return null; // Will redirect via useEffect
  }

  return (
    <ContentBox centered shadow="md" rounded="lg">
      <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
        {/* Header */}
        <div style={{ marginBottom: theme.spacing.xxl }}>
          <h1
            style={{
              fontSize: theme.fonts.size.xxl,
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.primary,
            }}
          >
            NFC Armband scannen
          </h1>
          
          <div
            style={{
              fontSize: theme.fonts.size.large,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
            }}
          >
            📚 {selectedActivity.name}
          </div>
          
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
            }}
          >
            📍 {selectedRoom.name}
          </div>
          
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
            }}
          >
            👨‍🏫 {authenticatedUser.staffName}
          </div>
        </div>

        {/* NFC Scanning Icon */}
        <div style={{ marginBottom: theme.spacing.xxl }}>
          <div style={{ fontSize: '8rem', marginBottom: theme.spacing.lg }}>
            📱
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.xl,
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.md,
              color: theme.colors.text.primary,
            }}
          >
            Bereit zum Scannen
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
            }}
          >
            Halten Sie ein NFC-Armband an das Gerät
          </div>
        </div>

        {/* Status Information */}
        <div
          style={{
            backgroundColor: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: theme.borders.radius.md,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.xxl,
          }}
        >
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: '#0c4a6e',
              marginBottom: theme.spacing.sm,
            }}
          >
            Session aktiv
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.small,
              color: '#075985',
            }}
          >
            Aktivität läuft • Bereit für Check-ins
          </div>
        </div>

        {/* TODO Message */}
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #f59e0b',
            borderRadius: theme.borders.radius.md,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.xxl,
          }}
        >
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: '#92400e',
              marginBottom: theme.spacing.sm,
              fontWeight: theme.fonts.weight.medium,
            }}
          >
            🚧 Implementierung ausstehend
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.small,
              color: '#a16207',
            }}
          >
            NFC-Scanning und Student Check-in/Check-out wird in der nächsten Phase implementiert
          </div>
        </div>

        {/* Navigation buttons */}
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.md,
            justifyContent: 'space-between',
            marginTop: theme.spacing.xl,
          }}
        >
          <Button onClick={handleBackToHome} variant="outline" size="medium">
            ← Zurück zum Start
          </Button>
          <Button onClick={handleLogout} variant="outline" size="medium">
            Abmelden
          </Button>
        </div>
      </div>
    </ContentBox>
  );
}

export default NFCScanningPage;