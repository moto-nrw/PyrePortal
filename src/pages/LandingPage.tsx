import { adapter } from '@platform';
import { useNavigate } from 'react-router-dom';

import BackButton from '../components/ui/BackButton';
import { useSchoolName } from '../hooks/useSchoolName';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

/** User-facing German UI copy for this page */
const texts = {
  restartButton: 'Neu starten',
  brandWordmark: 'moto',
  welcomeHeading: 'Willkommen bei moto!',
  loginButton: 'Anmelden',
  badgeCare: 'Offener Ganztag',
  badgeSecure: 'Sichere Anmeldung',
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
    <main
      className="grid min-h-screen w-full"
      style={{
        // Phoenix split auth layout: left form panel ~45%, right decorative ~55%
        gridTemplateColumns: '0.9fr 1.1fr',
      }}
    >
      {/* Restart button - fixed at top-right of viewport, over the right panel */}
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

      {/* LEFT PANEL - solid white form surface */}
      <section
        className="flex min-h-screen items-center justify-center px-8"
        style={{
          background: designSystem.colors.white,
          borderRight: `1px solid ${designSystem.surface.border}`,
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
            maxWidth: '420px',
          }}
        >
          {/* Brand row (phoenix MotoBrand pattern): small logo mark + "moto" wordmark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: designSystem.spacing.sm,
            }}
          >
            <img
              src="/img/moto_transparent.png"
              alt=""
              style={{
                height: '42px',
                width: 'auto',
                objectFit: 'contain',
              }}
            />
            <span
              style={{
                fontSize: '34px',
                fontWeight: 800,
                lineHeight: 1,
                color: designSystem.gray[900],
              }}
            >
              {texts.brandWordmark}
            </span>
          </div>

          {/* Welcome Heading with Phoenix MOTO Gradient (solid fallback for GKT WebView) */}
          <h1
            className={
              adapter.platform === 'gkt'
                ? 'font-bold text-[#5080d8]'
                : 'bg-gradient-to-r from-[#5080d8] to-[#83cd2d] bg-clip-text font-bold text-transparent'
            }
            style={{
              fontSize: '44px',
              marginBottom: 0,
              textAlign: 'center',
              lineHeight: 1.15,
            }}
          >
            {texts.welcomeHeading}
          </h1>

          <p
            style={{
              // School name is metadata, not a heading: smaller, medium weight,
              // muted gray so it never competes with the MOTO wordmark above.
              fontSize: '18px',
              color: designSystem.gray[500],
              textAlign: 'center',
              fontWeight: 500,
              marginTop: 0,
              marginBottom: 0,
              opacity: schoolName ? 1 : 0,
              transition: 'opacity 500ms ease-in',
              lineHeight: 1.3,
              // Clamp long school names so they never wrap into the login button.
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
              marginTop: '32px',
              fontSize: '28px',
              fontWeight: 600,
              padding: '16px 32px',
              backgroundColor: designSystem.brand.primary,
              color: designSystem.colors.white,
              // Fully round to match the kiosk's pill button language (radius not frozen).
              borderRadius: '9999px',
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
      </section>

      {/* RIGHT PANEL - dotted decorative surface */}
      <aside
        className="relative flex min-h-screen flex-col items-center justify-center px-8"
        style={{
          backgroundColor: designSystem.dottedBackground.base,
          backgroundImage: designSystem.dottedBackground.image,
          backgroundSize: designSystem.dottedBackground.size,
        }}
      >
        <img
          src="/img/moto_transparent.png"
          alt="Moto logo"
          style={{
            height: 'auto',
            width: '260px',
            maxWidth: '80%',
            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
          }}
        />

        {/* Phoenix badge pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          <BadgePill label={texts.badgeCare} dotColor={designSystem.brand.green} />
          <BadgePill label={texts.badgeSecure} dotColor={designSystem.brand.blue} />
        </div>
      </aside>
    </main>
  );
}

/** Phoenix-style translucent badge pill: white/85 blur surface, gray-200 border, colored dot. */
function BadgePill({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: designSystem.borderRadius.full,
        background: 'rgba(255,255,255,0.85)',
        border: `1px solid ${designSystem.surface.border}`,
        backdropFilter: 'blur(8px)',
        boxShadow: designSystem.shadows.sm,
        fontSize: '15px',
        fontWeight: 500,
        color: designSystem.gray[700],
      }}
    >
      <span
        style={{
          height: '10px',
          width: '10px',
          borderRadius: designSystem.borderRadius.full,
          backgroundColor: dotColor,
        }}
      />
      {label}
    </div>
  );
}

export default LandingPage;
