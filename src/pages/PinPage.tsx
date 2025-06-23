import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
import { api, type PinValidationResult } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function PinPage() {
  const { selectedUser, selectedUserId, setAuthenticatedUser } = useUserStore();
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
    if (!selectedUser || !selectedUserId) {
      logger.warn('PinPage accessed without selected user or ID', { selectedUser, selectedUserId });
    }

    return () => {
      logger.debug('PinPage component unmounted');
    };
  }, [selectedUser, selectedUserId, logger]);

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
      logger.info('User navigating back to user selection', { user: selectedUser });
      logNavigation('PinPage', 'UserSelectionPage');
      void navigate('/user-selection');
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

      // Check if we have selected user ID
      if (!selectedUserId) {
        const errorMsg = 'Kein Benutzer ausgewählt. Bitte gehen Sie zurück und wählen Sie einen Benutzer aus.';
        setErrorMessage(errorMsg);
        setIsErrorModalOpen(true);
        setPin('');
        logger.error('No user ID selected for PIN validation');
        return;
      }

      // Validate PIN with real API
      const result: PinValidationResult = await api.validateTeacherPin(pin, selectedUserId);

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

  // Custom numpad button component with modern styling
  const NumpadButton: React.FC<{
    onClick: () => void;
    isAction?: boolean;
    children: React.ReactNode;
  }> = ({ onClick, isAction = false, children }) => {
    return (
      <button
        onClick={onClick}
        style={{
          width: '90px',
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '12px',
          fontSize: isAction ? '24px' : '32px',
          fontWeight: 600,
          color: isAction ? '#6B7280' : '#1F2937',
          cursor: 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          position: 'relative',
          overflow: 'hidden',
          WebkitTapHighlightColor: 'transparent',
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.transform = 'scale(0.95)';
          e.currentTarget.style.backgroundColor = '#F0FDFA';
        }}
        onTouchEnd={(e) => {
          setTimeout(() => {
            if (e.currentTarget) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }, 150);
        }}
      >
        {/* Gradient border wrapper */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '12px',
            background: isAction 
              ? 'linear-gradient(to right, #E5E7EB, #D1D5DB)' 
              : 'linear-gradient(to right, #14B8A6, #3B82F6)',
            zIndex: 0,
          }}
        />
        
        {/* Inner content wrapper for border effect */}
        <div
          style={{
            position: 'absolute',
            inset: '2px',
            borderRadius: '10px',
            background: 'linear-gradient(to bottom, #FFFFFF, #FAFAFA)',
            zIndex: 1,
          }}
        />
        
        <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
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
          gap: '12px',
          maxWidth: '318px',
          margin: '0 auto',
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
                ⌫
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
      <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.sm}>
        <div
          style={{
            width: '100%',
            maxWidth: '500px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          {/* User info section with gradient accent */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.xs,
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(to right, #14B8A6, #3B82F6)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              <svg
                width="36"
                height="36"
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
            
            <div>
              <h1
                style={{
                  fontSize: '32px',
                  fontWeight: theme.fonts.weight.bold,
                  color: theme.colors.text.primary,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {selectedUser}
              </h1>
            </div>
          </div>

          {/* PIN eingeben text centered above dots */}
          <p
            style={{
              fontSize: '16px',
              color: theme.colors.text.secondary,
              margin: 0,
              textAlign: 'center',
              marginBottom: theme.spacing.sm,
            }}
          >
            PIN eingeben
          </p>

          {/* PIN display dots with gradient effect */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: theme.spacing.md,
            }}
          >
            {Array.from({ length: maxPinLength }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  transition: 'all 200ms ease',
                  background: i < pin.length 
                    ? 'linear-gradient(to right, #14B8A6, #3B82F6)'
                    : '#E5E7EB',
                  boxShadow: i < pin.length 
                    ? '0 2px 4px rgba(20, 184, 166, 0.3)'
                    : 'none',
                  transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div style={{ marginBottom: theme.spacing.md }}>{numpadGrid()}</div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              maxWidth: '400px',
            }}
          >
            <button
              onClick={handleBack}
              style={{
                flex: 1,
                height: '60px',
                fontSize: '18px',
                fontWeight: 500,
                background: 'transparent',
                color: '#14B8A6',
                border: '2px solid #14B8A6',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 200ms',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.backgroundColor = '#14B8A610';
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ← Zurück
            </button>

            <button
              onClick={handleSubmit}
              disabled={pin.length < maxPinLength || isLoading}
              style={{
                flex: 1,
                height: '60px',
                fontSize: '18px',
                fontWeight: 600,
                background: pin.length === maxPinLength && !isLoading
                  ? 'linear-gradient(to right, #14B8A6, #3B82F6)'
                  : '#E5E7EB',
                color: pin.length === maxPinLength && !isLoading ? '#FFFFFF' : '#9CA3AF',
                border: 'none',
                borderRadius: '12px',
                cursor: pin.length === maxPinLength && !isLoading ? 'pointer' : 'not-allowed',
                transition: 'all 200ms',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: pin.length === maxPinLength && !isLoading
                  ? '0 4px 6px -1px rgba(20, 184, 166, 0.3)'
                  : 'none',
                opacity: pin.length === maxPinLength && !isLoading ? 1 : 0.6,
              }}
              onTouchStart={(e) => {
                if (pin.length === maxPinLength && !isLoading) {
                  e.currentTarget.style.transform = 'scale(0.98)';
                  e.currentTarget.style.boxShadow = '0 2px 4px -1px rgba(20, 184, 166, 0.3)';
                }
              }}
              onTouchEnd={(e) => {
                if (pin.length === maxPinLength && !isLoading) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(20, 184, 166, 0.3)';
                }
              }}
            >
              {isLoading ? 'Überprüfung...' : 'Bestätigen'}
            </button>
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