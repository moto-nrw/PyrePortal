import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function LandingPage() {
  const navigate = useNavigate();
  const logger = createLogger('LandingPage');

  const handleLogin = () => {
    logger.info('User initiated login from landing page');
    logUserAction('landing_login_clicked');
    logNavigation('LandingPage', 'PinPage');
    void navigate('/pin');
  };

  // Handle application quit
  const handleQuit = () => {
    logger.info('User requested application quit from landing page');
    logUserAction('quit_app');

    invoke('quit_app', {})
      .then(() => {
        logger.debug('Application quit command sent successfully');
      })
      .catch(error => {
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'LandingPage.handleQuit'
        );
      });
  };

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      {/* Quit button - positioned absolutely */}
      <div
        style={{
          position: 'absolute',
          top: theme.spacing.lg,
          right: theme.spacing.lg,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={handleQuit}
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
          onTouchStart={e => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 49, 48, 0.1)';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
          }}
          onTouchEnd={e => {
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
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#FF3130',
            }}
          >
            Beenden
          </span>
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: '500px',
          margin: '0 auto',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: theme.spacing.sm,
          }}
        >
          <img
            src="/img/moto_transparent.png"
            style={{
              height: 'auto',
              width: '280px',
              maxWidth: '100%',
              transition: theme.animation.transition.slow,
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
            }}
            className="hover:drop-shadow-xl"
            alt="Moto logo"
          />
        </div>

        {/* Welcome Heading with Gradient */}
        <h1
          style={{
            fontSize: '48px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.md,
            textAlign: 'center',
            background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1.2,
          }}
        >
          Willkommen bei moto!
        </h1>

        {/* Login Button */}
        <button
          type="button"
          onClick={handleLogin}
          style={{
            width: '100%',
            maxWidth: '360px',
            height: '90px',
            fontSize: '28px',
            fontWeight: 600,
            padding: '16px 32px',
            background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
            color: '#FFFFFF',
            borderRadius: '12px',
            border: 'none',
            boxShadow:
              '0 10px 25px -5px rgba(20, 184, 166, 0.3), 0 10px 10px -5px rgba(59, 130, 246, 0.2)',
            cursor: 'pointer',
            transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            position: 'relative',
            overflow: 'hidden',
          }}
          onTouchStart={e => {
            e.currentTarget.style.transform = 'scale(0.98)';
            e.currentTarget.style.boxShadow =
              '0 5px 15px -5px rgba(20, 184, 166, 0.3), 0 5px 5px -5px rgba(59, 130, 246, 0.2)';
          }}
          onTouchEnd={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow =
              '0 10px 25px -5px rgba(20, 184, 166, 0.3), 0 10px 10px -5px rgba(59, 130, 246, 0.2)';
          }}
        >
          <span style={{ position: 'relative', zIndex: 1 }}>Anmelden</span>
        </button>
      </div>
    </ContentBox>
  );
}

export default LandingPage;
