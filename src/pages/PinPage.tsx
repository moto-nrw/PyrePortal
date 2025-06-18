import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox, ErrorModal } from '../components/ui';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function PinPage() {
  const { selectedUser, setAuthenticatedUser } = useUserStore();
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('PinPage');

  // Log component mount/unmount
  useEffect(() => {
    logger.debug('PinPage component mounted', { user: selectedUser });

    // If no user is selected, log an error
    if (!selectedUser) {
      logger.warn('PinPage accessed without selected user');
    }

    return () => {
      logger.debug('PinPage component unmounted');
    };
  }, [selectedUser, logger]);

  // Maximum PIN length
  const maxPinLength = 4;

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (pin.length === maxPinLength && !isLoading) {
      logger.info('Auto-submitting PIN', { user: selectedUser });
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
          logger.info('PIN entry completed', { user: selectedUser });
          logUserAction('pin_entry_completed', { user: selectedUser });
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
      logUserAction('pin_cleared', { user: selectedUser });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleClear');
    }
  };

  // Handle back button click
  const handleBack = () => {
    try {
      logger.info('User navigating back to login', { user: selectedUser });
      logNavigation('PinPage', 'LoginPage');
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
          user: selectedUser,
        });
        logUserAction('pin_verification_failed', {
          reason: 'incomplete_pin',
          user: selectedUser,
        });
        return;
      }

      // Performance marking for PIN verification flow
      performance.mark('pin-verification-start');
      setIsLoading(true);

      // Validate PIN with real API
      const result: PinValidationResult = await api.validateTeacherPin(pin);

      if (result.success && result.userData) {
        // Store authenticated user context with PIN
        setAuthenticatedUser({
          staffId: result.userData.staffId,
          staffName: result.userData.staffName,
          deviceName: result.userData.deviceName,
          pin: pin,
        });

        logger.info('PIN verified successfully', {
          user: selectedUser,
          staffName: result.userData.staffName,
          deviceName: result.userData.deviceName,
        });
        logUserAction('pin_verified', { user: selectedUser });

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
        logger.warn('PIN verification failed', {
          reason: result.isLocked ? 'account_locked' : 'invalid_pin',
          user: selectedUser,
          isLocked: result.isLocked,
        });
        logUserAction('pin_verification_failed', {
          reason: result.isLocked ? 'account_locked' : 'invalid_pin',
          user: selectedUser,
        });
      }
    } catch (error) {
      const errorMsg = 'Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.';
      setErrorMessage(errorMsg);
      setIsErrorModalOpen(true);
      setPin(''); // Clear PIN
      logger.error('PIN verification error', { error, user: selectedUser });
      logError(error instanceof Error ? error : new Error(String(error)), 'PinPage.handleSubmit');
    } finally {
      setIsLoading(false);
    }
  };

  // Custom numpad button component
  const NumpadButton: React.FC<{
    onClick: () => void;
    isAction?: boolean;
    children: React.ReactNode;
  }> = ({ onClick, isAction = false, children }) => {
    const baseStyles: React.CSSProperties = {
      width: '87px',
      height: '67px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.borders.radius.md,
      fontSize: isAction ? theme.fonts.size.large : '2.1rem',
      fontWeight: theme.fonts.weight.bold,
      backgroundColor: theme.colors.background.light,
      color: isAction ? theme.colors.text.secondary : theme.colors.text.primary,
      border: `2px solid ${theme.colors.border.light}`,
      boxShadow: theme.shadows.sm,
      transition: 'all 0.1s ease',
      cursor: 'pointer',
      outline: 'none',
    };

    return (
      <button
        onClick={onClick}
        style={baseStyles}
        className="hover:bg-gray-50 hover:shadow-md active:scale-95 active:bg-gray-100"
      >
        {children}
      </button>
    );
  };

  // Create numpad grid (1-9, then special buttons and 0)
  const numpadGrid = () => {
    const numpadLayout = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      ['clear', 0, 'delete'],
    ];

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: theme.spacing.sm,
          maxWidth: '340px',
          margin: '0 auto',
          justifyItems: 'center',
        }}
      >
        {numpadLayout.flat().map((item, _index) => {
          if (item === 'clear') {
            return (
              <NumpadButton key="clear" onClick={handleClear} isAction>
                C
              </NumpadButton>
            );
          } else if (item === 'delete') {
            return (
              <NumpadButton key="delete" onClick={handleDelete} isAction>
                ←
              </NumpadButton>
            );
          } else {
            return (
              <NumpadButton key={item} onClick={() => handleNumpadClick(item)}>
                {item}
              </NumpadButton>
            );
          }
        })}
      </div>
    );
  };

  return (
    <>
      <ContentBox centered shadow="md" rounded="lg">
        <div
          style={{
            width: '100%',
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* User name display */}
          <h1
            style={{
              fontSize: theme.fonts.size.xxl,
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.lg,
              textAlign: 'center',
              color: theme.colors.text.primary,
            }}
          >
            {selectedUser}
          </h1>

          {/* PIN display */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.md,
            }}
          >
            {Array.from({ length: maxPinLength }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '42px',
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.borders.radius.lg,
                  fontSize: '1.3rem',
                  fontWeight: theme.fonts.weight.bold,
                  transition: 'all 0.1s ease',
                  border: `3px solid ${i < pin.length ? theme.colors.primary : theme.colors.border.light}`,
                  backgroundColor:
                    i < pin.length ? theme.colors.primary : theme.colors.background.light,
                  color: i < pin.length ? theme.colors.text.light : 'transparent',
                  boxShadow: i < pin.length ? theme.shadows.md : theme.shadows.sm,
                }}
              >
                •
              </div>
            ))}
          </div>


          {/* Numpad */}
          <div style={{ width: '100%', marginBottom: theme.spacing.md }}>{numpadGrid()}</div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              justifyContent: 'space-between',
              gap: theme.spacing.lg,
            }}
          >
            <Button
              onClick={handleBack}
              variant="outline"
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                minWidth: '160px'
              }}
            >
              Zurück
            </Button>

            <Button
              onClick={handleSubmit}
              variant="primary"
              disabled={pin.length < maxPinLength || isLoading}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                minWidth: '160px'
              }}
            >
              {isLoading ? 'Überprüfung...' : 'Bestätigen'}
            </Button>
          </div>
        </div>
      </ContentBox>

      {/* Error Modal */}
      <ErrorModal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        message={errorMessage}
      />
    </>
  );
}

export default PinPage;
