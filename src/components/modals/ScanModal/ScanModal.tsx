import { faFaceSmile, faFaceMeh, faFaceFrown, faChildren } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { DailyFeedbackRating } from '../../../services/api';
import type { CloseReason } from '../../ui/modal/types';
import { ModalTimeoutIndicator } from '../../ui/ModalTimeoutIndicator';

import type { ScanModalModel, ScanModalCallbacks, ScanModalVariant } from './types';
import { SCAN_VARIANT_COLORS } from './types';

/**
 * Props for the ScanModal component.
 */
export interface ScanModalProps {
  /** Modal model from getScanModalModel */
  model: ScanModalModel | null;
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: (reason: CloseReason) => void;
  /** Callbacks for user actions */
  callbacks: ScanModalCallbacks;
  /** Key to reset timer animation (e.g., when state changes) */
  timerResetKey?: string | number;
}

/**
 * ScanModal - Domain-specific modal wrapper for RFID scanning scenarios.
 *
 * Uses the model-driven approach where getScanModalModel produces a configuration
 * and ScanModal renders it. This separates business logic from presentation.
 *
 * @example
 * const model = getScanModalModel(state, callbacks);
 *
 * <ScanModal
 *   model={model}
 *   isOpen={showModal}
 *   onClose={handleClose}
 *   callbacks={callbacks}
 * />
 */
export const ScanModal: React.FC<ScanModalProps> = ({
  model,
  isOpen,
  onClose,
  callbacks,
  timerResetKey,
}) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Clear timeout
  const clearAutoCloseTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Start auto-close timer
  const startAutoCloseTimer = useCallback(() => {
    if (!model?.autoCloseMs) return;

    clearAutoCloseTimeout();
    setIsTimerRunning(true);
    setAnimationKey(prev => prev + 1);

    timeoutRef.current = setTimeout(() => {
      setIsTimerRunning(false);
      timeoutRef.current = null;
      onClose('timeout');
    }, model.autoCloseMs);
  }, [model?.autoCloseMs, clearAutoCloseTimeout, onClose]);

  // Start/stop timer based on modal state
  useEffect(() => {
    if (isOpen && model?.autoCloseMs) {
      startAutoCloseTimer();
    } else {
      clearAutoCloseTimeout();
      setIsTimerRunning(false);
    }

    return clearAutoCloseTimeout;
  }, [isOpen, model?.autoCloseMs, startAutoCloseTimer, clearAutoCloseTimeout]);

  // Reset timer when timerResetKey changes
  useEffect(() => {
    if (isOpen && model?.autoCloseMs && timerResetKey !== undefined) {
      startAutoCloseTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerResetKey]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose('backdrop');
      }
    },
    [onClose]
  );

  if (!isOpen || !model) return null;

  const colors = model.customColors ?? SCAN_VARIANT_COLORS[model.variant];
  const effectiveDuration = model.progressDuration ?? model.autoCloseMs ?? 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          backgroundColor: colors.background,
          borderRadius: '32px',
          padding: '64px',
          maxWidth: '700px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Background pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}
        />

        {/* Icon */}
        <ScanModalIcon variant={model.variant} />

        {/* Title */}
        <h2
          style={{
            fontSize: '48px',
            fontWeight: 800,
            marginBottom: '24px',
            color: '#FFFFFF',
            lineHeight: 1.2,
            position: 'relative',
            zIndex: 2,
          }}
        >
          {model.title}
        </h2>

        {/* Body or custom content based on variant */}
        <ScanModalContent model={model} callbacks={callbacks} />

        {/* Progress indicator */}
        {model.showProgress && model.autoCloseMs && (
          <ModalTimeoutIndicator
            key={animationKey}
            duration={effectiveDuration}
            isActive={isTimerRunning}
            position="bottom"
            height={8}
          />
        )}
      </div>
    </div>
  );
};

/**
 * Renders the icon for scan modal variants.
 */
const ScanModalIcon: React.FC<{ variant: ScanModalVariant }> = ({ variant }) => {
  const containerStyle: React.CSSProperties = {
    width: '120px',
    height: '120px',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 32px',
    position: 'relative',
    zIndex: 2,
  };

  const svgProps = {
    width: 80,
    height: 80,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'white',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (variant) {
    case 'dailyCheckoutConfirmation':
    case 'dailyCheckoutFarewell':
      // Home icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps} strokeWidth={2.2}>
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
      );

    case 'feedbackPrompt':
      // Question mark or similar - using info icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps} strokeWidth={2.5}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
      );

    case 'supervisor':
    case 'info':
      // User/supervisor icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      );

    case 'error':
      // X icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps} strokeWidth={3}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      );

    case 'checkIn':
    case 'transfer':
    case 'schulhof':
      // Checkmark icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps} strokeWidth={3}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
      );

    case 'checkOut':
    case 'destinationSelection':
      // Exit/door icon
      return (
        <div style={containerStyle}>
          <svg {...svgProps} strokeWidth={3}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
      );

    default:
      return null;
  }
};

/**
 * Renders the content area for scan modal variants.
 */
const ScanModalContent: React.FC<{
  model: ScanModalModel;
  callbacks: ScanModalCallbacks;
}> = ({ model, callbacks }) => {
  switch (model.variant) {
    case 'feedbackPrompt':
      return <FeedbackPromptContent studentName={model.body as string} callbacks={callbacks} />;

    case 'dailyCheckoutConfirmation':
      return (
        <DailyCheckoutConfirmationContent
          studentName={model.body as string}
          callbacks={callbacks}
        />
      );

    case 'destinationSelection':
      return (
        <DestinationSelectionContent
          isSchulhofAvailable={callbacks.isSchulhofAvailable}
          callbacks={callbacks}
        />
      );

    case 'dailyCheckoutFarewell':
      // No additional content for farewell
      return null;

    default:
      // Standard body text
      if (model.body) {
        return (
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(255, 255, 255, 0.95)',
              fontWeight: 600,
              position: 'relative',
              zIndex: 2,
            }}
          >
            {model.body}
          </div>
        );
      }
      return null;
  }
};

/**
 * Feedback prompt content with emoji buttons.
 */
const FeedbackPromptContent: React.FC<{
  studentName: string;
  callbacks: ScanModalCallbacks;
}> = ({ studentName, callbacks }) => {
  const [hoveredButton, setHoveredButton] = useState<DailyFeedbackRating | null>(null);

  const feedbackButtons = [
    {
      rating: 'positive' as DailyFeedbackRating,
      icon: faFaceSmile,
      label: 'Gut',
      colors: {
        background: 'rgba(16, 185, 129, 0.3)',
        border: 'rgba(16, 185, 129, 0.7)',
        hoverBackground: 'rgba(16, 185, 129, 0.5)',
      },
    },
    {
      rating: 'neutral' as DailyFeedbackRating,
      icon: faFaceMeh,
      label: 'Okay',
      colors: {
        background: 'rgba(245, 158, 11, 0.3)',
        border: 'rgba(245, 158, 11, 0.7)',
        hoverBackground: 'rgba(245, 158, 11, 0.5)',
      },
    },
    {
      rating: 'negative' as DailyFeedbackRating,
      icon: faFaceFrown,
      label: 'Schlecht',
      colors: {
        background: 'rgba(239, 68, 68, 0.3)',
        border: 'rgba(239, 68, 68, 0.7)',
        hoverBackground: 'rgba(239, 68, 68, 0.5)',
      },
    },
  ];

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Student name subtitle */}
      <div
        style={{
          fontSize: '28px',
          color: 'rgba(255, 255, 255, 0.95)',
          fontWeight: 600,
          marginBottom: '40px',
        }}
      >
        {studentName}
      </div>

      {/* Feedback buttons */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {feedbackButtons.map(({ rating, icon, label, colors }) => (
          <button
            key={rating}
            onClick={() => callbacks.onFeedbackSubmit(rating)}
            style={{
              borderRadius: '20px',
              color: '#FFFFFF',
              padding: '24px 32px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              minWidth: '140px',
              borderWidth: '3px',
              borderStyle: 'solid',
              backgroundColor:
                hoveredButton === rating ? colors.hoverBackground : colors.background,
              borderColor: colors.border,
              transform: hoveredButton === rating ? 'scale(1.05)' : 'scale(1)',
            }}
            onMouseEnter={() => setHoveredButton(rating)}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <FontAwesomeIcon
              icon={icon}
              style={{ fontSize: '56px', width: '64px', height: '64px' }}
            />
            <span style={{ fontSize: '20px', fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Daily checkout confirmation content with Yes/No buttons.
 */
const DailyCheckoutConfirmationContent: React.FC<{
  studentName: string;
  callbacks: ScanModalCallbacks;
}> = ({ studentName, callbacks }) => {
  const [hoveredButton, setHoveredButton] = useState<'confirm' | 'decline' | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Student name subtitle */}
      <div
        style={{
          fontSize: '28px',
          color: 'rgba(255, 255, 255, 0.95)',
          fontWeight: 600,
          marginBottom: '40px',
        }}
      >
        {studentName}
      </div>

      {/* Buttons stacked vertically */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        {/* Confirm button */}
        <button
          onClick={callbacks.onDailyCheckoutConfirm}
          style={{
            backgroundColor:
              hoveredButton === 'confirm'
                ? 'rgba(255, 255, 255, 0.35)'
                : 'rgba(255, 255, 255, 0.25)',
            border: '3px solid rgba(255, 255, 255, 0.5)',
            borderRadius: '20px',
            color: '#FFFFFF',
            fontSize: '32px',
            fontWeight: 700,
            padding: '20px 64px',
            cursor: 'pointer',
            transition: 'all 200ms',
            outline: 'none',
            transform: hoveredButton === 'confirm' ? 'scale(1.05)' : 'scale(1)',
          }}
          onMouseEnter={() => setHoveredButton('confirm')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          Ja, nach Hause
        </button>

        {/* Decline button */}
        <button
          onClick={callbacks.onDailyCheckoutDecline}
          style={{
            backgroundColor:
              hoveredButton === 'decline' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
            border: '2px solid',
            borderColor:
              hoveredButton === 'decline' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.4)',
            borderRadius: '16px',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '24px',
            fontWeight: 600,
            padding: '12px 48px',
            cursor: 'pointer',
            transition: 'all 200ms',
            outline: 'none',
          }}
          onMouseEnter={() => setHoveredButton('decline')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          Nein
        </button>
      </div>
    </div>
  );
};

/**
 * Destination selection content with Raumwechsel/Schulhof buttons.
 */
const DestinationSelectionContent: React.FC<{
  isSchulhofAvailable: boolean;
  callbacks: ScanModalCallbacks;
}> = ({ isSchulhofAvailable, callbacks }) => {
  const [hoveredButton, setHoveredButton] = useState<'raumwechsel' | 'schulhof' | null>(null);

  const buttonStyle = (isHovered: boolean): React.CSSProperties => ({
    backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.25)',
    border: '3px solid rgba(255, 255, 255, 0.5)',
    borderRadius: '20px',
    color: '#FFFFFF',
    fontSize: '32px',
    fontWeight: 700,
    padding: '32px 48px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    width: '280px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '12px',
    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
  });

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
        }}
      >
        {/* Raumwechsel button */}
        <button
          onClick={() => callbacks.onDestinationSelect('raumwechsel')}
          style={buttonStyle(hoveredButton === 'raumwechsel')}
          onMouseEnter={() => setHoveredButton('raumwechsel')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span style={{ fontSize: '24px', fontWeight: 800 }}>Raumwechsel</span>
        </button>

        {/* Schulhof button (if available) */}
        {isSchulhofAvailable && (
          <button
            onClick={() => callbacks.onDestinationSelect('schulhof')}
            style={buttonStyle(hoveredButton === 'schulhof')}
            onMouseEnter={() => setHoveredButton('schulhof')}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <FontAwesomeIcon icon={faChildren} style={{ fontSize: '48px', color: '#FFFFFF' }} />
            <span style={{ fontSize: '24px', fontWeight: 800 }}>Schulhof</span>
          </button>
        )}
      </div>

      {!isSchulhofAvailable && (
        <p
          style={{
            marginTop: '16px',
            fontSize: '18px',
            color: 'rgba(255, 255, 255, 0.7)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          (Schulhof derzeit nicht verfügbar)
        </p>
      )}
    </div>
  );
};
