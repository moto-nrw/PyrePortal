import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function PinPage() {
  const { setAuthenticatedUser } = useUserStore();
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('PinPage');

  // Log component mount/unmount
  useEffect(() => {
    logger.debug('PinPage component mounted for global PIN entry');

    return () => {
      logger.debug('PinPage component unmounted');
    };
  }, [logger]);

  // Maximum PIN length
  const maxPinLength = 4;

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
      logger.info('User navigating back to landing page');
      logNavigation('PinPage', 'LandingPage');
      void navigate('/');
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

  // Custom numpad button component with modern styling matching other pages
  const NumpadButton: React.FC<{
    onClick: () => void;
    isAction?: boolean;
    children: React.ReactNode;
  }> = ({ onClick, isAction = false, children }) => {
    return (
      <button
        onClick={onClick}
        style={{
          position: 'relative',
          width: '120px',
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '12px',
          fontSize: isAction ? '24px' : '28px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          overflow: 'hidden',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={e => {
          e.currentTarget.style.transform = 'scale(0.95)';
        }}
        onTouchEnd={e => {
          setTimeout(() => {
            if (e.currentTarget) {
              e.currentTarget.style.transform = 'scale(1)';
            }
          }, 150);
        }}
      >
        {/* Gradient border */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '12px',
            background: isAction
              ? 'linear-gradient(135deg, #6B7280, #4B5563)'
              : 'linear-gradient(135deg, #5080D8, #3f6bc4)',
            zIndex: 0,
          }}
        />

        {/* Inner content */}
        <div
          style={{
            position: 'absolute',
            inset: '3px',
            borderRadius: '9px',
            background: 'linear-gradient(to bottom, #FFFFFF, #F8FAFC)',
            zIndex: 1,
          }}
        />

        <span
          style={{
            position: 'relative',
            zIndex: 2,
            color: isAction ? '#6B7280' : '#1F2937',
          }}
        >
          {children}
        </span>
      </button>
    );
  };

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modern back button - positioned absolutely like other pages */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 28px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '28px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(8px)',
            }}
            onTouchStart={e => {
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
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
              stroke="#374151"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Zurück
            </span>
          </button>
        </div>

        {/* Welcome Header with User Info - Extra compact sizing */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '0',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              background: 'linear-gradient(135deg, #5080D8, #3f6bc4)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px',
              boxShadow: '0 4px 12px rgba(80, 128, 216, 0.3)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '34px',
              fontWeight: theme.fonts.weight.bold,
              margin: 0,
              color: theme.colors.text.primary,
              lineHeight: 1.1,
            }}
          >
            PIN-Eingabe
          </h1>
          <p
            style={{
              fontSize: '17px',
              color: theme.colors.text.secondary,
              margin: '2px 0 0 0',
              fontWeight: 500,
            }}
          >
            Bitte geben Sie den globalen PIN ein
          </p>
        </div>

        {/* Main Content - Centered */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: '400px', marginTop: '12px' }}>
            {/* PIN display dots with modern styling - compact */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: '10px',
                boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {Array.from({ length: maxPinLength }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    transition: 'all 300ms ease',
                    background:
                      i < pin.length ? 'linear-gradient(135deg, #5080D8, #3f6bc4)' : '#E5E7EB',
                    boxShadow:
                      i < pin.length
                        ? '0 2px 6px rgba(80, 128, 216, 0.4)'
                        : 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
                    transform: i < pin.length ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            {/* Numpad with modern grid layout - compact */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                maxWidth: '400px',
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

              <NumpadButton onClick={handleDelete} isAction>
                ⌫
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
    </ContentBox>
  );
}

export default PinPage;
