import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Dropdown, ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function LoginPage() {
  const { users, fetchTeachers, setSelectedUser, isLoading, error } = useUserStore();
  const [localSelectedUser, setLocalSelectedUser] = useState('');
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('LoginPage');

  // Log component mount and fetch teachers once
  useEffect(() => {
    logger.debug('LoginPage component mounted');

    // Always fetch teachers on mount (the store will handle deduplication)
    fetchTeachers().catch(error => {
      logger.error('Failed to fetch teachers on mount', { error });
    });

    return () => {
      logger.debug('LoginPage component unmounted');
    };
  }, [fetchTeachers, logger]); // Include fetchTeachers and logger in dependency array

  const handleLogin = () => {
    try {
      if (localSelectedUser) {
        logger.info('User attempting login', {
          username: localSelectedUser,
          timestamp: new Date().toISOString(),
        });

        // Performance marking for login flow
        performance.mark('login-start');

        // Find the user ID for the selected user
        const selectedUserObj = users.find(u => u.name === localSelectedUser);
        setSelectedUser(localSelectedUser, selectedUserObj?.id ?? null);

        // Log user action and navigation events
        logUserAction('login', { username: localSelectedUser });
        logNavigation('LoginPage', 'PinPage');

        // Performance measurement
        performance.mark('login-end');
        performance.measure('login-process', 'login-start', 'login-end');
        const measure = performance.getEntriesByName('login-process')[0];
        logger.debug('Login process performance', { duration_ms: measure.duration });

        void navigate('/pin');
      } else {
        logger.warn('Login attempted without selecting user', {
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'LoginPage.handleLogin');
    }
  };

  // Log user selection changes and auto-submit
  const handleUserChange = (value: string) => {
    logger.debug('User selection changed', { selectedUser: value });
    setLocalSelectedUser(value);
    
    // Auto-submit when user is selected
    if (value) {
      logger.info('Auto-submitting login after user selection', {
        username: value,
        timestamp: new Date().toISOString(),
      });
      
      // Directly navigate with the selected value
      setTimeout(() => {
        logger.info('User attempting login', {
          username: value,
          timestamp: new Date().toISOString(),
        });

        // Performance marking for login flow
        performance.mark('login-start');

        // Find the user ID for the selected user
        const selectedUserObj = users.find(u => u.name === value);
        setSelectedUser(value, selectedUserObj?.id ?? null);

        // Log user action and navigation events
        logUserAction('login', { username: value });
        logNavigation('LoginPage', 'PinPage');

        // Performance measurement
        performance.mark('login-end');
        performance.measure('login-process', 'login-start', 'login-end');
        const measure = performance.getEntriesByName('login-process')[0];
        logger.debug('Login process performance', { duration_ms: measure.duration });

        void navigate('/pin');
      }, 100);
    }
  };

  // Handle application quit
  const handleQuit = () => {
    logger.info('User requested application quit');
    logUserAction('quit_app');
    
    invoke('quit_app', {})
      .then(() => {
        logger.debug('Application quit command sent successfully');
      })
      .catch((error) => {
        logError(error instanceof Error ? error : new Error(String(error)), 'LoginPage.handleQuit');
      });
  };

  return (
    <ContentBox centered shadow="md" rounded="lg">
      {/* Navigation buttons - positioned absolutely */}
      <div
        style={{
          position: 'absolute',
          top: theme.spacing.lg,
          right: theme.spacing.lg,
          zIndex: 10,
        }}
      >
        <Button
          type="button"
          onClick={handleQuit}
          variant="outline"
          size="small"
        >
          Beenden
        </Button>
      </div>

      <h1
        style={{
          fontSize: theme.fonts.size.xxl,
          fontWeight: theme.fonts.weight.bold,
          marginBottom: theme.spacing.xl,
          textAlign: 'center',
        }}
      >
        Login
      </h1>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: theme.spacing.xxl,
        }}
      >
        <img
          src="/img/moto_transparent.png"
          style={{
            height: 'auto',
            maxWidth: '300px',
            transition: theme.animation.transition.slow,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
          }}
          className="hover:drop-shadow-lg hover:filter"
          alt="Moto logo"
        />
      </div>

      {error && (
        <div
          style={{
            backgroundColor: theme.colors.error + '20',
            color: theme.colors.error,
            padding: theme.spacing.md,
            borderRadius: theme.borders.radius.md,
            marginBottom: theme.spacing.lg,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '15px',
          marginTop: theme.spacing.xxl,
        }}
      >
        <Dropdown
          options={users.map(user => ({
            value: user.name,
            label: user.name,
          }))}
          value={localSelectedUser || null}
          onChange={value => handleUserChange(value as string)}
          placeholder={isLoading ? 'Lade Lehrer...' : 'Benutzer auswählen...'}
          width="350px"
          disabled={isLoading}
        />
        <Button
          type="button"
          onClick={handleLogin}
          variant="secondary"
          size="medium"
          disabled={isLoading || !localSelectedUser}
        >
          {isLoading ? 'Lädt...' : 'Anmelden'}
        </Button>
      </div>

    </ContentBox>
  );
}

export default LoginPage;
