import { faDeleteLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import {
  createLogger,
  logNavigation,
  logUserAction,
  logError,
  serializeError,
} from '../utils/logger';

/** User-facing German UI copy for this page */
const texts = {
  title: 'PIN-Eingabe',
  subtitle: 'Bitte geben Sie Ihren 4-stelligen PIN ein',
  incompletePinError: 'Bitte geben Sie einen 4-stelligen PIN ein',
  invalidPinError: 'Ungültiger PIN. Bitte versuchen Sie es erneut.',
  validationError: 'Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.',
} as const;

/**
 * Custom numpad button component - Phoenix Clean Style
 * Defined outside PinPage to avoid recreation on each render
 */
interface NumpadButtonProps {
  readonly onClick: () => void;
  readonly isAction?: boolean;
  readonly children: React.ReactNode;
}

// FROZEN by PinPage.test.tsx: press scale(0.95), clear-btn press bg #F3F4F6,
// resting boxShadow '0 3px 8px rgba(0, 0, 0, 0.1)'. Keep exact rendered values.
const NUMPAD_SHADOW = '0 3px 8px rgba(0, 0, 0, 0.1)';
const NUMPAD_SHADOW_PRESSED = '0 1px 2px rgba(0, 0, 0, 0.1)';

function NumpadButton({ onClick, isAction = false, children }: NumpadButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        height: '95px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isAction ? designSystem.gray[50] : designSystem.surface.background,
        border: isAction
          ? `3px solid ${designSystem.gray[300]}`
          : `3px solid ${designSystem.gray[200]}`,
        borderRadius: designSystem.borderRadius.xl,
        fontSize: isAction ? '42px' : '50px',
        fontWeight: 700,
        color: isAction ? designSystem.gray[500] : designSystem.gray[900],
        cursor: 'pointer',
        transition: designSystem.transitions.base,
        outline: 'none',
        boxShadow: NUMPAD_SHADOW,
      }}
      onPointerDown={e => {
        e.currentTarget.style.transform = designSystem.scales.activeSmall;
        e.currentTarget.style.backgroundColor = isAction
          ? designSystem.gray[100]
          : designSystem.gray[50];
        e.currentTarget.style.boxShadow = NUMPAD_SHADOW_PRESSED;
      }}
      onPointerUp={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.backgroundColor = isAction
          ? designSystem.gray[50]
          : designSystem.surface.background;
        e.currentTarget.style.boxShadow = NUMPAD_SHADOW;
      }}
      onPointerLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.backgroundColor = isAction
          ? designSystem.gray[50]
          : designSystem.surface.background;
        e.currentTarget.style.boxShadow = NUMPAD_SHADOW;
      }}
    >
      {children}
    </button>
  );
}

function PinPage() {
  const { setAuthenticatedUser } = useUserStore();
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('PinPage');

  // Maximum PIN length and stable dot identifiers for React keys
  const maxPinLength = 4;
  const pinDotIds = ['dot-1', 'dot-2', 'dot-3', 'dot-4'] as const;

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (pin.length === maxPinLength && !isLoading) {
      logger.info('Auto-submitting global PIN');
      void handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]); // Only watch pin changes

  // Handle numpad button click
  const handleNumpadClick = (num: number | string) => {
    try {
      if (pin.length < maxPinLength) {
        setPin(prev => prev + num);

        // Log pin entry progress (without revealing the full pin)
        logger.debug('PIN digit entered', {
          digitPosition: pin.length + 1,
          progress: `${pin.length + 1}/${maxPinLength}`,
          completed: pin.length + 1 === maxPinLength,
        });

        // If PIN is complete after this digit, log it
        if (pin.length + 1 === maxPinLength) {
          logger.info('Global PIN entry completed');
          logUserAction('global_pin_entry_completed');
        }
      } else {
        logger.debug('Attempted to enter more than maximum PIN length');
      }
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'PinPage.handleNumpadClick'
      );
    }
  };

  // Handle delete button click
  const handleDelete = () => {
    try {
      if (pin.length > 0) {
        setPin(prev => prev.slice(0, -1));
        logger.debug('PIN digit deleted', { remainingLength: pin.length - 1 });
      } else {
        logger.debug('Attempted to delete from empty PIN');
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleDelete');
    }
  };

  // Handle clear button click
  const handleClear = () => {
    try {
      setPin('');
      logger.debug('PIN cleared');
      logUserAction('pin_cleared');
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleClear');
    }
  };

  // Handle back button click
  const handleBack = () => {
    try {
      logger.info('User navigating back from PinPage');
      logNavigation('PinPage', 'back');
      void navigate(-1);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleBack');
    }
  };

  // Handle PIN submission
  const handleSubmit = async () => {
    try {
      // Check PIN length first
      if (pin.length !== maxPinLength) {
        const errorMsg = texts.incompletePinError;
        setErrorMessage(errorMsg);
        setIsErrorModalOpen(true);
        setPin(''); // Clear PIN
        logger.warn('PIN verification failed', {
          reason: 'incomplete_pin',
          pinLength: pin.length,
        });
        logUserAction('pin_verification_failed', {
          reason: 'incomplete_pin',
        });
        return;
      }

      // Performance marking for PIN verification flow
      performance.mark('pin-verification-start');
      setIsLoading(true);

      // Validate PIN with global OGS PIN via device ping
      const result: PinValidationResult = await api.validateGlobalPin(pin);

      if (result.success && result.userData) {
        // Store authenticated device context with global PIN
        setAuthenticatedUser({
          staffId: 0, // No specific staff ID for global authentication
          staffName: 'OGS Device',
          deviceName: result.userData.deviceName,
          pin: pin,
        });

        logger.info('Global PIN verified successfully', {
          deviceName: result.userData.deviceName,
        });
        logUserAction('global_pin_verified');

        // Navigate to home page after successful PIN entry
        logNavigation('PinPage', 'HomeViewPage');

        // Performance measurement
        performance.mark('pin-verification-end');
        performance.measure(
          'pin-verification-process',
          'pin-verification-start',
          'pin-verification-end'
        );
        const measure = performance.getEntriesByName('pin-verification-process')[0];
        logger.debug('PIN verification performance', {
          duration_ms: measure.duration,
          staffName: result.userData?.staffName,
          deviceName: result.userData?.deviceName,
        });

        void navigate('/home');
      } else {
        const errorMsg = result.error ?? texts.invalidPinError;
        setErrorMessage(errorMsg);
        setIsErrorModalOpen(true);
        setPin(''); // Clear PIN
        logger.warn('Global PIN verification failed', {
          reason: 'invalid_pin',
        });
        logUserAction('global_pin_verification_failed', {
          reason: 'invalid_pin',
        });
      }
    } catch (error) {
      const errorMsg = texts.validationError;
      setErrorMessage(errorMsg);
      setIsErrorModalOpen(true);
      setPin(''); // Clear PIN
      logger.error('Global PIN verification error', { error: serializeError(error) });
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleSubmit');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BackgroundWrapper>
      {/* Back button - positioned at top-left of viewport */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 50,
        }}
      >
        <BackButton onClick={handleBack} />
      </div>

      <div className="flex min-h-screen items-center justify-center">
        {/* White container - Use grid layout for true full width */}
        <div className="h-screen w-screen overflow-auto bg-white/90 p-8 backdrop-blur-md">
          {/* Header - 7-inch optimized */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '40px',
              marginBottom: '20px',
            }}
          >
            {/* Title */}
            <h1
              style={{
                fontSize: '40px',
                margin: '0 0 8px 0',
                lineHeight: 1.2,
                fontWeight: 700,
                color: designSystem.gray[900],
              }}
            >
              {texts.title}
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: '18px',
                margin: 0,
                color: designSystem.gray[500],
                fontWeight: 500,
              }}
            >
              {texts.subtitle}
            </p>
          </div>

          {/* Main Content - Full Width */}
          <div style={{ width: '100%' }}>
            {/* PIN display dots - transforms into spinner when loading */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: isLoading ? '0px' : '20px',
                padding: '16px 24px',
                backgroundColor: designSystem.gray[50],
                borderRadius: designSystem.borderRadius.lg,
                border: `2px solid ${isLoading ? designSystem.gray[400] : designSystem.gray[200]}`,
                width: 'fit-content',
                margin: '0 auto 12px auto',
                transition: 'all 300ms ease-out',
                minHeight: '56px',
              }}
            >
              {isLoading ? (
                <div
                  data-testid="pin-loading-spinner"
                  style={{
                    width: '24px',
                    height: '24px',
                    border: `3px solid ${designSystem.gray[200]}`,
                    borderTopColor: designSystem.gray[900],
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : (
                pinDotIds.map((dotId, i) => (
                  <div
                    key={dotId}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      transition: designSystem.transitions.base,
                      backgroundColor:
                        i < pin.length ? designSystem.gray[900] : designSystem.gray[200],
                      transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))
              )}
            </div>

            {/* Numpad Grid - 40% Viewport Width */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                width: '40vw',
                margin: '0 auto',
              }}
            >
              {/* Numbers 1-9 */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <NumpadButton key={num} onClick={() => handleNumpadClick(num)}>
                  {num}
                </NumpadButton>
              ))}

              {/* Bottom row: Clear, 0, Delete */}
              <NumpadButton onClick={handleClear} isAction>
                C
              </NumpadButton>

              <NumpadButton onClick={() => handleNumpadClick(0)}>0</NumpadButton>

              <NumpadButton onClick={handleDelete} isAction aria-label="Delete last digit">
                <FontAwesomeIcon icon={faDeleteLeft} />
              </NumpadButton>
            </div>
          </div>
        </div>
      </div>

      {/* Add animation keyframes */}
      <style>
        {`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {/* Error Modal */}
      <ErrorModal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        message={errorMessage}
      />
    </BackgroundWrapper>
  );
}

export default PinPage;
