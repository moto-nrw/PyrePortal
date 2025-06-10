import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function PinPage() {
  const { selectedUser, setAuthenticatedUser } = useUserStore();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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

  // Handle numpad button click
  const handleNumpadClick = (num: number | string) => {
    try {
      if (pin.length < maxPinLength) {
        setPin(prev => prev + num);
        setError(null);

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
        setError(null);
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
      setError(null);
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
        setError(errorMsg);
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
      setError(null);

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
          deviceName: result.userData.deviceName
        });
        logUserAction('pin_verified', { user: selectedUser });

        // Navigate to room selection page after successful PIN entry
        logNavigation('PinPage', 'RoomSelectionPage');

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
          deviceName: result.userData?.deviceName
        });

        void navigate('/home');
      } else {
        setError(result.error ?? 'Ungültiger PIN. Bitte versuchen Sie es erneut.');
        logger.warn('PIN verification failed', {
          reason: result.isLocked ? 'account_locked' : 'invalid_pin',
          user: selectedUser,
          isLocked: result.isLocked
        });
        logUserAction('pin_verification_failed', {
          reason: result.isLocked ? 'account_locked' : 'invalid_pin',
          user: selectedUser,
        });
      }
    } catch (error) {
      const errorMsg = 'Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.';
      setError(errorMsg);
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
      width: '100%',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      fontSize: isAction ? theme.fonts.size.large : theme.fonts.size.xl,
      fontWeight: isAction ? theme.fonts.weight.semibold : theme.fonts.weight.bold,
      backgroundColor: isAction ? '#e5e7eb' : theme.colors.background.light,
      color: isAction ? '#4b5563' : theme.colors.text.primary,
      border: `1px solid ${isAction ? '#d1d5db' : theme.colors.border.light}`,
      boxShadow: theme.shadows.sm,
      transition: theme.animation.transition.fast,
      cursor: 'pointer',
      outline: 'none',
    };

    return (
      <button
        onClick={onClick}
        style={baseStyles}
        className={
          isAction ? 'hover:bg-gray-300 active:bg-gray-400' : 'hover:bg-gray-100 active:bg-gray-200'
        }
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
      <div className="mx-auto grid max-w-[350px] grid-cols-3 gap-6">
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
    <ContentBox centered shadow="md" rounded="lg">
      <div className="relative flex w-full max-w-md flex-col items-center">
        {/* User name display */}
        <h1
          style={{
            fontSize: theme.fonts.size.xxl,
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.xl,
            textAlign: 'center',
          }}
        >
          {selectedUser}
        </h1>

        {/* PIN display */}
        <div className="mb-8 flex justify-center gap-3">
          {Array.from({ length: maxPinLength }).map((_, i) => (
            <div
              key={i}
              className="flex h-12 w-12 items-center justify-center rounded-md text-2xl transition-colors duration-200"
              style={{
                boxSizing: 'border-box',
                border: '2px solid transparent',
                borderColor: i < pin.length ? theme.colors.primary : 'transparent',
                backgroundColor: i < pin.length ? theme.colors.primary : 'transparent',
                color: i < pin.length ? theme.colors.text.light : 'transparent',
              }}
            >
              •
            </div>
          ))}
        </div>

        {/* Error message */}
        {error && <div className="mb-4 text-red-500">{error}</div>}

        {/* Numpad */}
        <div className="w-full">{numpadGrid()}</div>

        {/* Spacer */}
        <div className="h-40"></div>

        {/* Action buttons */}
        <div className="flex w-full max-w-[450px] justify-between px-4">
          <Button onClick={handleBack} variant="outline" size="medium">
            Zurück
          </Button>

          <Button
            onClick={handleSubmit}
            variant="secondary"
            size="medium"
            disabled={pin.length < maxPinLength || isLoading}
          >
            {isLoading ? 'Überprüfung...' : 'Bestätigen'}
          </Button>
        </div>
      </div>
    </ContentBox>
  );
}

export default PinPage;
