import { adapter } from '@platform';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import BackButton from '../components/ui/BackButton';
import { useSchoolName } from '../hooks/useSchoolName';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

/** User-facing German UI copy for this page */
const texts = {
  restartButton: 'Neu starten',
  welcomeHeading: 'Willkommen bei moto!',
  loginButton: 'Anmelden',
} as const;

function LandingPage() {
  const navigate = useNavigate();
  const logger = createLogger('LandingPage');
  const schoolName = useSchoolName();

  const handleLogin = () => {
    logger.info('User initiated login from landing page');
    logUserAction('landing_login_clicked');
    logNavigation('LandingPage', 'PinPage');
    void navigate('/pin');
  };

  // Handle application restart via the platform adapter (the local Tauri app exits the process)
  const handleRestart = () => {
    logger.info('User requested application restart from landing page');
    logUserAction('restart_app');

    adapter
      .restartApp()
      .then(() => {
        logger.debug('Application restart command sent successfully');
      })
      .catch((error: unknown) => {
        // Expected: may fail because the process exits (Tauri) or page reloads (GKT/browser)
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
        <BackButton
          onClick={handleRestart}
          text={texts.restartButton}
          color="blue"
          icon="restart"
        />
      </div>

      <div className="flex min-h-screen items-center justify-center p-4">
        {/* White container - Phoenix content surface (flat, 24px radius, shadow-sm) */}
        <div
          className="relative w-full max-w-2xl p-12"
          style={{
            background: designSystem.surface.background,
            border: `1px solid ${designSystem.surface.border}`,
            borderRadius: designSystem.surface.borderRadius,
            boxShadow: designSystem.surface.shadow,
            backdropFilter: designSystem.surface.blur,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: designSystem.spacing.md,
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
                marginBottom: designSystem.spacing.sm,
              }}
            >
              <img
                src="/img/moto_transparent.png"
                style={{
                  height: 'auto',
                  width: '280px',
                  maxWidth: '100%',
                  transition: designSystem.transitions.slow,
                  filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                }}
                className="hover:drop-shadow-xl"
                alt="Moto logo"
              />
            </div>

            {/* Welcome Heading with Phoenix MOTO Gradient (solid fallback for GKT WebView) */}
            <h1
              className={
                adapter.platform === 'gkt'
                  ? 'font-bold text-[#5080d8]'
                  : 'bg-gradient-to-r from-[#5080d8] to-[#83cd2d] bg-clip-text font-bold text-transparent'
              }
              style={{
                fontSize: '64px',
                marginBottom: designSystem.spacing.md,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {texts.welcomeHeading}
            </h1>

            <p
              style={{
                fontSize: '36px',
                color: designSystem.gray[600],
                textAlign: 'center',
                fontWeight: 700,
                marginTop: '-8px',
                marginBottom: designSystem.spacing.sm,
                opacity: schoolName ? 1 : 0,
                transition: 'opacity 500ms ease-in',
                lineHeight: 1.2,
                // Clamp long school names to 2 lines so they never wrap into the
                // login button or the card's bottom padding.
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                wordBreak: 'break-word',
                maxWidth: '100%',
                minHeight: '1.5em',
              }}
            >
              {schoolName ?? '\u00A0'}
            </p>

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
                backgroundColor: designSystem.brand.primary,
                color: designSystem.colors.white,
                borderRadius: designSystem.borderRadius.md,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                cursor: 'pointer',
                transition: designSystem.transitions.base,
                outline: 'none',
              }}
              onPointerDown={e => {
                e.currentTarget.style.transform = designSystem.scales.activeSmall;
                e.currentTarget.style.backgroundColor = designSystem.brand.primaryHover;
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
              }}
              onPointerUp={e => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.backgroundColor = designSystem.brand.primary;
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
              onPointerLeave={e => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.backgroundColor = designSystem.brand.primary;
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              {texts.loginButton}
            </button>
          </div>
        </div>
      </div>
    </BackgroundWrapper>
  );
}

export default LandingPage;
