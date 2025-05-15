import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Select, ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function LoginPage() {
  const { users, setSelectedUser } = useUserStore();
  const [localSelectedUser, setLocalSelectedUser] = useState('');
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('LoginPage');

  // Log component mount/unmount
  useEffect(() => {
    logger.debug('LoginPage component mounted');

    return () => {
      logger.debug('LoginPage component unmounted');
    };
  }, [logger]);

  const handleLogin = () => {
    try {
      if (localSelectedUser) {
        logger.info('User attempting login', {
          username: localSelectedUser,
          timestamp: new Date().toISOString(),
        });

        // Performance marking for login flow
        performance.mark('login-start');

        setSelectedUser(localSelectedUser);

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

  // Transform users data for the Select component
  const userOptions = users.map(user => ({
    value: user.name,
    label: user.name,
  }));

  // Log user selection changes
  const handleUserChange = (value: string) => {
    logger.debug('User selection changed', { selectedUser: value });
    setLocalSelectedUser(value);
  };

  return (
    <ContentBox centered shadow="md" rounded="lg">
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

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '15px',
          marginTop: theme.spacing.xxl,
        }}
      >
        <Select
          id="user-select"
          options={userOptions}
          value={localSelectedUser}
          onChange={handleUserChange}
          placeholder="Benutzer auswählen..."
          width="350px"
        />
        <Button type="button" onClick={handleLogin} variant="secondary" size="medium">
          Anmelden
        </Button>
      </div>
    </ContentBox>
  );
}

export default LoginPage;
