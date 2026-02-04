import { faDeleteLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

/**
 * Custom numpad button component - Phoenix Clean Style
 * Defined outside PinPage to avoid recreation on each render
 */
interface NumpadButtonProps {
  readonly onClick: () => void;
  readonly isAction?: boolean;
  readonly children: React.ReactNode;
}

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
        backgroundColor: isAction ? '#F9FAFB' : '#FFFFFF',
        border: isAction ? '3px solid #D1D5DB' : '3px solid #E5E7EB',
        borderRadius: '24px',
        fontSize: isAction ? '42px' : '50px',
        fontWeight: 700,
        color: isAction ? '#6B7280' : '#111827',
        cursor: 'pointer',
        transition: 'all 150ms ease-out',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        boxShadow: '0 3px 8px rgba(0, 0, 0, 0.1)',
      }}
      onTouchStart={e => {
        e.currentTarget.style.transform = 'scale(0.95)';
        e.currentTarget.style.backgroundColor = isAction ? '#F3F4F6' : '#F9FAFB';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
      }}
      onTouchEnd={e => {
        setTimeout(() => {
          if (e.currentTarget) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.backgroundColor = isAction ? '#F9FAFB' : '#FFFFFF';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
          }
        }, 100);
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
        const errorMsg = 'Bitte geben Sie einen 4-stelligen PIN ein';
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
        const errorMsg = result.error ?? 'Ungültiger PIN. Bitte versuchen Sie es erneut.';
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
      const errorMsg = 'Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.';
      setErrorMessage(errorMsg);
      setIsErrorModalOpen(true);
      setPin(''); // Clear PIN
      logger.error('Global PIN verification error', { error });
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
                color: '#111827',
              }}
            >
              PIN-Eingabe
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: '18px',
                margin: 0,
                color: '#6B7280',
                fontWeight: 500,
              }}
            >
              Bitte geben Sie Ihren 4-stelligen PIN ein
            </p>
          </div>

          {/* Main Content - Full Width */}
          <div style={{ width: '100%' }}>
            {/* PIN display dots - BLACK (no blue!) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '20px',
                marginBottom: '12px',
                padding: '16px 24px',
                backgroundColor: '#F9FAFB',
                borderRadius: '16px',
                border: '2px solid #E5E7EB',
                width: 'fit-content',
                margin: '0 auto 12px auto',
              }}
            >
              {pinDotIds.map((dotId, i) => (
                <div
                  key={dotId}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    transition: 'all 200ms ease-out',
                    backgroundColor: i < pin.length ? '#111827' : '#E5E7EB',
                    transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
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

            {/* Loading state */}
            {isLoading && (
              <div
                style={{
                  textAlign: 'center',
                  marginTop: '24px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid #E5E7EB',
                    borderTopColor: '#5080D8',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px',
                  }}
                />
                <p
                  style={{
                    fontSize: '16px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  PIN wird überprüft...
                </p>
              </div>
            )}
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
