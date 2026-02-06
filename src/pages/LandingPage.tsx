import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import BackButton from '../components/ui/BackButton';
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

  // Handle application restart (Balena will restart the container)
  const handleRestart = () => {
    logger.info('User requested application restart from landing page');
    logUserAction('restart_app');

    invoke('restart_app', {})
      .then(() => {
        logger.debug('Application restart command sent successfully');
      })
      .catch(error => {
        // Expected: invoke may fail because the process exits
        // This is normal behavior when Balena restarts the container
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'LandingPage.handleRestart'
        );
      });
  };

  return (
    <BackgroundWrapper>
      {/* Restart button - positioned at top-right of viewport */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 50,
        }}
      >
        <BackButton onClick={handleRestart} text="Neu starten" color="blue" icon="restart" />
      </div>

      <div className="flex min-h-screen items-center justify-center p-4">
        {/* White container with shadow - Phoenix style */}
        <div className="relative w-full max-w-2xl rounded-3xl bg-white/90 p-12 shadow-xl backdrop-blur-md">
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

            {/* Welcome Heading with Phoenix MOTO Gradient */}
            <h1
              className="bg-gradient-to-r from-[#5080d8] to-[#83cd2d] bg-clip-text font-bold text-transparent"
              style={{
                fontSize: '64px',
                marginBottom: theme.spacing.md,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              Willkommen bei moto!
            </h1>

            {/* Login Button - Phoenix shadcn style (NO GRADIENT) */}
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
                backgroundColor: '#111827',
                color: '#FFFFFF',
                borderRadius: '16px',
                border: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                cursor: 'pointer',
                transition: 'all 200ms ease-out',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              onTouchStart={e => {
                e.currentTarget.style.transform = 'scale(0.95)';
                e.currentTarget.style.backgroundColor = '#1F2937';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
              }}
              onTouchEnd={e => {
                setTimeout(() => {
                  if (e.currentTarget) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = '#111827';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                  }
                }, 100);
              }}
            >
              Anmelden
            </button>
          </div>
        </div>
      </div>
    </BackgroundWrapper>
  );
}

export default LandingPage;
