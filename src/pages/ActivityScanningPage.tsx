import {
  faClock,
  faFaceSmile,
  faFaceMeh,
  faFaceFrown,
  faRestroom,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { useActivityScanningPage } from '../hooks/pages/useActivityScanningPage';
import { formatRoomName, type DailyFeedbackRating } from '../services/api';

/** User-facing German UI copy for this page */
const texts = {
  noActivitySelected: 'Keine Aktivität ausgewählt',
  backToHomeButton: 'Zurück zur Startseite',
  pickupTimeLoading: 'Abholzeit wird geladen...',
  pickupQueryScanPrompt: 'Bitte halte dein Armband an das Lesegerät.',
  feedbackPositive: 'Gut',
  feedbackNeutral: 'Okay',
  feedbackNegative: 'Schlecht',
  destinationRaumwechsel: 'Raumwechsel',
  destinationSchulhof: 'Schulhof',
  destinationToilette: 'Toilette',
  destinationNachHause: 'nach Hause',
  pickupTimeToday: 'Abholzeit heute',
  pickupTimeValue: (time: string) => `${time} Uhr`,
  noPickupTimeToday: 'Für heute ist keine Abholzeit hinterlegt.',
  roomFallback: 'diesem Raum',
  checkedInMessage: (roomName: string) => `Du bist jetzt in ${roomName}`,
  transferSuccess: 'Raumwechsel erfolgreich',
  loginButton: 'Anmelden',
  loginAriaLabel: 'Anmelden - zur PIN-Eingabe',
  pickupQueryAriaLabel: 'Abholzeit abfragen',
  unknownRoom: 'Unbekannt',
  pickupQueryHeading: 'Abholzeit abfragen',
  feedbackHeading: (firstName: string) => `Wie war dein Tag, ${firstName}?`,
  farewellHeading: (firstName: string) => `Tschüss, ${firstName}!`,
  supervisorRoomFallback: 'diesen Raum',
  supervisorHeading: (name: string, roomName: string) => `${name} betreut jetzt ${roomName}`,
  pickupInfoHeading: (firstName: string) => `Abholzeit für ${firstName}`,
  checkinGreeting: (name: string) => `Hallo, ${name}!`,
  destinationQuestionHeading: (firstName: string) => `Wohin geht ${firstName}?`,
} as const;

// Feedback button color schemes: green (positive), yellow (neutral), red (negative)
const FEEDBACK_BUTTON_COLORS = {
  positive: {
    background: 'rgba(16, 185, 129, 0.3)', // Green with transparency
    border: 'rgba(16, 185, 129, 0.7)',
    hoverBackground: 'rgba(16, 185, 129, 0.5)',
  },
  neutral: {
    background: 'rgba(245, 158, 11, 0.3)', // Yellow/amber with transparency
    border: 'rgba(245, 158, 11, 0.7)',
    hoverBackground: 'rgba(245, 158, 11, 0.5)',
  },
  negative: {
    background: 'rgba(239, 68, 68, 0.3)', // Red with transparency
    border: 'rgba(239, 68, 68, 0.7)',
    hoverBackground: 'rgba(239, 68, 68, 0.5)',
  },
} as const;

// Button style constants for consistent styling (matching Check In/Check Out modal patterns)
const FEEDBACK_BUTTON_STYLES = {
  base: {
    borderRadius: '20px',
    color: '#FFFFFF',
    padding: '24px 32px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '12px',
    minWidth: '140px',
    borderWidth: '3px',
    borderStyle: 'solid' as const,
  },
  hover: {
    transform: 'scale(1.05)',
  },
  normal: {
    transform: 'scale(1)',
  },
};

const DESTINATION_BUTTON_STYLES = {
  base: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    border: '3px solid rgba(255, 255, 255, 0.5)',
    borderRadius: '20px',
    color: '#FFFFFF',
    fontSize: '32px',
    fontWeight: 700,
    padding: '28px 36px',
    cursor: 'pointer',
    transition: 'all 200ms',
    outline: 'none',
    width: '240px',
    aspectRatio: '5 / 4',
  },
  hover: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: 'scale(1.05)',
  },
  normal: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: 'scale(1)',
  },
};

/** Color presets for destination buttons matching their modal colors */
const DESTINATION_COLORS = {
  default: { bg: 'rgba(255, 255, 255, 0.25)', bgHover: 'rgba(255, 255, 255, 0.35)' },
  schulhof: { bg: 'rgba(245, 158, 11, 0.5)', bgHover: 'rgba(245, 158, 11, 0.65)' },
  toilette: { bg: 'rgba(96, 165, 250, 0.85)', bgHover: 'rgba(96, 165, 250, 0.95)' },
  destructive: { bg: 'rgba(220, 38, 38, 0.5)', bgHover: 'rgba(220, 38, 38, 0.65)' },
};

// Static SVG icons hoisted out of render path to avoid per-render allocation on Pi
const ICON_RAUMWECHSEL = (
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
);

const ICON_SCHULHOF = (
  <svg
    width="48"
    height="48"
    viewBox="0 0 64 64"
    fill="none"
    stroke="#FFFFFF"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Top horizontal bar */}
    <line x1="6" y1="8" x2="58" y2="8" strokeWidth="3" />
    {/* Left A-leg front */}
    <line x1="6" y1="8" x2="12" y2="58" />
    {/* Left A-leg back */}
    <line x1="6" y1="8" x2="2" y2="58" />
    {/* Right A-leg front */}
    <line x1="58" y1="8" x2="52" y2="58" />
    {/* Right A-leg back */}
    <line x1="58" y1="8" x2="62" y2="58" />
    {/* Left chain */}
    <line x1="24" y1="8" x2="22" y2="40" />
    {/* Right chain */}
    <line x1="40" y1="8" x2="42" y2="40" />
    {/* Seat */}
    <rect x="19" y="40" width="26" height="4" rx="2" fill="#FFFFFF" />
  </svg>
);

const ICON_NACH_HAUSE = (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

/** Reusable destination button for checkout modal */
function DestinationButton({
  label,
  icon,
  colorScheme = 'default',
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  colorScheme?: keyof typeof DESTINATION_COLORS;
  onClick: () => void;
}) {
  const colors = DESTINATION_COLORS[colorScheme];

  return (
    <button
      onClick={onClick}
      style={{
        ...DESTINATION_BUTTON_STYLES.base,
        backgroundColor: colors.bg,
        border:
          colorScheme !== 'default'
            ? '3px solid rgba(255, 255, 255, 0.6)'
            : DESTINATION_BUTTON_STYLES.base.border,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}
      onPointerDown={e => {
        e.currentTarget.style.backgroundColor = colors.bgHover;
        e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.hover.transform;
      }}
      onPointerUp={e => {
        e.currentTarget.style.backgroundColor = colors.bg;
        e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.normal.transform;
      }}
      onPointerLeave={e => {
        e.currentTarget.style.backgroundColor = colors.bg;
        e.currentTarget.style.transform = DESTINATION_BUTTON_STYLES.normal.transform;
      }}
    >
      {icon}
      <span style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF' }}>{label}</span>
    </button>
  );
}

// Button configuration arrays
const feedbackButtons = [
  { rating: 'positive' as DailyFeedbackRating, icon: faFaceSmile, label: texts.feedbackPositive },
  { rating: 'neutral' as DailyFeedbackRating, icon: faFaceMeh, label: texts.feedbackNeutral },
  { rating: 'negative' as DailyFeedbackRating, icon: faFaceFrown, label: texts.feedbackNegative },
];

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedActivity,
    selectedRoom,
    authenticatedUser,
    currentScan,
    studentCount,
    processingQueueSize,
    scanContextId,
    checkoutDestinationState,
    setCheckoutDestinationState,
    handleDestinationSelect,
    destinationCount,
    schulhofRoomId,
    wcRoomId,
    deviceConfig,
    showFeedbackPrompt,
    handleNachHause,
    handleFeedbackSubmit,
    isAwaitingPickupQueryScan,
    isPickupQueryLoading,
    isPickupQueryPromptOpen,
    isPickupQueryVisualState,
    isPickupQueryHeadingState,
    pickupQueryButtonDisabled,
    handlePickupQueryClick,
    shouldShowCheckModal,
    shouldKeepPickupQueryModalOpen,
    modalTimeoutDuration,
    handleModalTimeout,
    handleAnmelden,
  } = useActivityScanningPage();

  // Guard clause - if data is missing, show loading or error state
  if (!selectedActivity || !selectedRoom || !authenticatedUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <p className="text-lg text-gray-600">{texts.noActivitySelected}</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            {texts.backToHomeButton}
          </button>
        </div>
      </div>
    );
  }

  // Helper function to render modal content area - extracted to avoid nested ternaries
  const renderModalContent = () => {
    if (!currentScan) {
      if (isPickupQueryLoading) {
        return (
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(255, 255, 255, 0.95)',
              fontWeight: 600,
              position: 'relative',
              zIndex: 2,
              textAlign: 'center',
            }}
          >
            {texts.pickupTimeLoading}
          </div>
        );
      }

      if (!isAwaitingPickupQueryScan) return null;

      return (
        <div
          style={{
            fontSize: '28px',
            color: 'rgba(255, 255, 255, 0.95)',
            fontWeight: 600,
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
          }}
        >
          {texts.pickupQueryScanPrompt}
        </div>
      );
    }

    // Feedback prompt UI - styled to match Check In/Check Out modals
    if (showFeedbackPrompt) {
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
          {/* Feedback buttons container - centered with consistent spacing */}
          <div
            style={{
              display: 'flex',
              gap: '24px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {feedbackButtons.map(({ rating, icon, label }) => {
              const colorScheme = FEEDBACK_BUTTON_COLORS[rating];
              return (
                <button
                  key={rating}
                  onClick={() => handleFeedbackSubmit(rating)}
                  style={{
                    ...FEEDBACK_BUTTON_STYLES.base,
                    backgroundColor: colorScheme.background,
                    borderColor: colorScheme.border,
                  }}
                  onPointerDown={e => {
                    e.currentTarget.style.backgroundColor = colorScheme.hoverBackground;
                    e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.hover.transform;
                  }}
                  onPointerUp={e => {
                    e.currentTarget.style.backgroundColor = colorScheme.background;
                    e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.normal.transform;
                  }}
                  onPointerLeave={e => {
                    e.currentTarget.style.backgroundColor = colorScheme.background;
                    e.currentTarget.style.transform = FEEDBACK_BUTTON_STYLES.normal.transform;
                  }}
                >
                  {/* Icon sized appropriately within button */}
                  <FontAwesomeIcon
                    icon={icon}
                    style={{
                      fontSize: '56px',
                      width: '64px',
                      height: '64px',
                    }}
                  />
                  <span style={{ fontSize: '20px', fontWeight: 700 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Unified checkout destination selection (Raumwechsel, Schulhof, nach Hause)
    if (
      currentScan.action === 'checked_out' &&
      checkoutDestinationState &&
      !checkoutDestinationState.showingFarewell
    ) {
      const destinations: {
        destination: 'raumwechsel' | 'schulhof' | 'toilette' | 'nach_hause';
        label: string;
        icon: React.ReactNode;
        colorScheme?: keyof typeof DESTINATION_COLORS;
        onClick: () => void;
      }[] = [
        ...(deviceConfig?.checkout.raumwechsel_enabled !== false
          ? [
              {
                destination: 'raumwechsel' as const,
                label: texts.destinationRaumwechsel,
                icon: ICON_RAUMWECHSEL,
                onClick: () => void handleDestinationSelect('raumwechsel'),
              },
            ]
          : []),
        ...(schulhofRoomId && deviceConfig?.checkout.schulhof_enabled !== false
          ? [
              {
                destination: 'schulhof' as const,
                label: texts.destinationSchulhof,
                colorScheme: 'schulhof' as const,
                icon: ICON_SCHULHOF,
                onClick: () => void handleDestinationSelect('schulhof'),
              },
            ]
          : []),
        ...(wcRoomId && deviceConfig?.checkout.wc_enabled !== false
          ? [
              {
                destination: 'toilette' as const,
                label: texts.destinationToilette,
                colorScheme: 'toilette' as const,
                icon: (
                  <FontAwesomeIcon
                    icon={faRestroom}
                    style={{ fontSize: '48px', color: '#FFFFFF' }}
                  />
                ),
                onClick: () => void handleDestinationSelect('toilette'),
              },
            ]
          : []),
        ...(checkoutDestinationState.dailyCheckoutAvailable
          ? [
              {
                destination: 'nach_hause' as const,
                label: texts.destinationNachHause,
                colorScheme: 'destructive' as const,
                icon: ICON_NACH_HAUSE,
                onClick: handleNachHause,
              },
            ]
          : []),
      ];

      // No destinations available — skip straight to farewell instead of showing
      // "Wohin geht X?" with an empty button grid
      if (destinations.length === 0) {
        setCheckoutDestinationState(prev => (prev ? { ...prev, showingFarewell: true } : null));
        return null;
      }

      // Determine grid columns: 2x2 for 3-4 buttons, single row for 1-2
      const gridColumns = destinations.length >= 3 ? 2 : destinations.length;

      return (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: `repeat(${gridColumns}, ${DESTINATION_BUTTON_STYLES.base.width})`,
            gap: '24px',
            justifyContent: 'center',
          }}
        >
          {destinations.map(({ destination, label, icon, colorScheme, onClick }) => (
            <DestinationButton
              key={destination}
              label={label}
              icon={icon}
              colorScheme={colorScheme}
              onClick={onClick}
            />
          ))}
        </div>
      );
    }

    // Default message content
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
        {(() => {
          // Error/Info states - show the detailed message from backend
          if (
            (currentScan as { showAsError?: boolean }).showAsError ||
            (currentScan as { isInfo?: boolean }).isInfo
          ) {
            return currentScan.message ?? '';
          }

          // Special handling for Schulhof/Toilette - no additional content needed
          if ((currentScan as { isSchulhof?: boolean }).isSchulhof) {
            return ''; // Empty content - title message is enough
          }
          if ((currentScan as { isToilette?: boolean }).isToilette) {
            return ''; // Empty content - title message is enough
          }

          switch (currentScan.action) {
            case 'checked_in':
              return (
                <>
                  {currentScan.pickup_time && (
                    <div
                      style={{
                        marginBottom: '24px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '20px',
                          opacity: 0.9,
                          marginBottom: '4px',
                          fontWeight: 500,
                        }}
                      >
                        {texts.pickupTimeToday}
                      </div>
                      <div
                        style={{
                          fontSize: '48px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                        }}
                      >
                        {texts.pickupTimeValue(currentScan.pickup_time)}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: currentScan.pickup_time ? '22px' : undefined }}>
                    {texts.checkedInMessage(
                      currentScan.room_name
                        ? formatRoomName(currentScan.room_name)
                        : texts.roomFallback
                    )}
                  </div>
                </>
              );
            case 'pickup_info':
              return (
                <>
                  {currentScan.pickup_time ? (
                    <div
                      style={{
                        marginBottom: currentScan.pickup_note ? '20px' : '0',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '20px',
                          opacity: 0.9,
                          marginBottom: '4px',
                          fontWeight: 500,
                        }}
                      >
                        {texts.pickupTimeToday}
                      </div>
                      <div
                        style={{
                          fontSize: '52px',
                          fontWeight: 700,
                          lineHeight: 1.1,
                        }}
                      >
                        {texts.pickupTimeValue(currentScan.pickup_time)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>{texts.noPickupTimeToday}</div>
                  )}
                  {currentScan.pickup_note && (
                    <div
                      style={{
                        marginTop: currentScan.pickup_time ? '8px' : '24px',
                        fontSize: '22px',
                        lineHeight: 1.4,
                        textAlign: 'center',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {currentScan.pickup_note}
                    </div>
                  )}
                </>
              );
            case 'checked_out':
              return ''; // Checkout shows destination buttons, no extra text needed
            case 'transferred':
              return texts.transferSuccess;
            default:
              return '';
          }
        })()}
      </div>
    );
  };

  return (
    <>
      <BackgroundWrapper>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Anmelden Button - Top Right */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 10,
            }}
          >
            <BackButton
              onClick={handleAnmelden}
              text={texts.loginButton}
              customIcon={
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#374151"
                  strokeWidth="2.5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              ariaLabel={texts.loginAriaLabel}
            />
          </div>

          <button
            type="button"
            onClick={handlePickupQueryClick}
            disabled={pickupQueryButtonDisabled}
            aria-label={texts.pickupQueryAriaLabel}
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 10,
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: pickupQueryButtonDisabled ? 'rgba(80, 128, 216, 0.35)' : '#5080D8',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: pickupQueryButtonDisabled
                ? 'none'
                : '0 12px 24px rgba(80, 128, 216, 0.28)',
              cursor: pickupQueryButtonDisabled ? 'not-allowed' : 'pointer',
              transition:
                'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
              opacity: pickupQueryButtonDisabled ? 0.7 : 1,
            }}
            onPointerDown={e => {
              if (pickupQueryButtonDisabled) return;
              e.currentTarget.style.transform = 'scale(0.96)';
            }}
            onPointerUp={e => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onPointerLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <FontAwesomeIcon icon={faClock} style={{ fontSize: '34px' }} />
          </button>

          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              padding: '24px',
            }}
          >
            {/* Header Section */}
            <div
              style={{
                textAlign: 'center',
                marginTop: '40px',
                marginBottom: '20px',
              }}
            >
              <h1
                style={{
                  fontSize: '56px',
                  fontWeight: 700,
                  color: '#111827',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {selectedActivity.name}
              </h1>
              <p
                style={{
                  fontSize: '32px',
                  color: '#6B7280',
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                {selectedRoom?.name || texts.unknownRoom}
              </p>
            </div>

            {/* Main Student Count Display / RFID Processing Spinner (cross-fade) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                flex: 1,
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: '220px',
                  fontWeight: 800,
                  color: '#83cd2d',
                  lineHeight: 1,
                  marginTop: '-12px',
                  opacity: processingQueueSize > 0 ? 0 : 1,
                }}
              >
                {studentCount ?? 0}
              </div>
              <div
                style={{
                  position: 'absolute',
                  width: '140px',
                  height: '140px',
                  borderRadius: '50%',
                  background:
                    'conic-gradient(from 0deg, transparent 0%, #5080D8 50%, #83CD2D 100%)',
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))',
                  WebkitMask:
                    'radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))',
                  animation:
                    processingQueueSize > 0 ? 'rfid-center-spin 0.8s linear infinite' : 'none',
                  transition: 'opacity 0.3s ease',
                  opacity: processingQueueSize > 0 ? 1 : 0,
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </BackgroundWrapper>

      {/* Check-in/Check-out Modal */}
      {shouldShowCheckModal && (
        <ModalBase
          isOpen={shouldShowCheckModal}
          onClose={handleModalTimeout}
          autoWidth
          size={
            !isPickupQueryPromptOpen &&
            !showFeedbackPrompt &&
            currentScan?.action === 'checked_out' &&
            checkoutDestinationState &&
            !checkoutDestinationState.showingFarewell
              ? destinationCount >= 3
                ? 'xl'
                : 'lg'
              : 'lg'
          }
          backgroundColor={(() => {
            if (isPickupQueryVisualState) return '#5080D8';
            // "nach Hause" flow states (farewell, feedback) use blue
            if (checkoutDestinationState?.showingFarewell || showFeedbackPrompt) return '#6366f1';
            // Check for Schulhof check-in (special yellow)
            if ((currentScan as { isSchulhof?: boolean } | null)?.isSchulhof) return '#F59E0B'; // Yellow for Schulhof
            if ((currentScan as { isToilette?: boolean } | null)?.isToilette) return '#60A5FA'; // Blue for Toilette
            // Check for supervisor authentication
            if (currentScan?.action === 'supervisor_authenticated') return '#3B82F6'; // Blue for supervisor
            // Check for error or info states
            if ((currentScan as { showAsError?: boolean } | null)?.showAsError) return '#ef4444'; // Red for errors
            if ((currentScan as { isInfo?: boolean } | null)?.isInfo) return '#6366f1'; // Blue for info
            // Original logic for success states
            return currentScan?.action === 'checked_in' || currentScan?.action === 'transferred'
              ? '#83cd2d'
              : '#f87C10';
          })()}
          timeout={modalTimeoutDuration}
          timeoutResetKey={
            isPickupQueryPromptOpen
              ? `pickup-query-prompt-${scanContextId}`
              : showFeedbackPrompt
                ? `feedback-${checkoutDestinationState?.studentId}`
                : `${currentScan?.student_id ?? 'none'}-${currentScan?.action ?? 'none'}-${checkoutDestinationState?.showingFarewell ?? false}-${showFeedbackPrompt}`
          }
          closeOnContentClick={
            !shouldKeepPickupQueryModalOpen &&
            !showFeedbackPrompt &&
            !(
              currentScan?.action === 'checked_out' &&
              checkoutDestinationState &&
              !checkoutDestinationState.showingFarewell
            )
          }
          closeOnBackdropClick={!shouldKeepPickupQueryModalOpen}
          closeOnEscapeKey={!shouldKeepPickupQueryModalOpen}
        >
          {/* Background pattern for visual interest */}
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

          {/* Icon container with background circle - hidden during checkout destination selection (but visible during feedback) */}
          {(isPickupQueryPromptOpen ||
            showFeedbackPrompt ||
            !(
              currentScan?.action === 'checked_out' &&
              checkoutDestinationState &&
              !checkoutDestinationState.showingFarewell
            )) && (
            <div
              style={{
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
              }}
            >
              {(() => {
                if (isPickupQueryVisualState) {
                  return (
                    <FontAwesomeIcon
                      icon={faClock}
                      style={{ fontSize: '72px', color: '#FFFFFF' }}
                    />
                  );
                }
                // "nach Hause" flow - Home icon for farewell and feedback states
                if (checkoutDestinationState?.showingFarewell || showFeedbackPrompt) {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  );
                }
                // Supervisor authentication icon
                if (currentScan?.action === 'supervisor_authenticated') {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  );
                }
                // Error state - X icon
                if ((currentScan as { showAsError?: boolean } | null)?.showAsError) {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  );
                }
                // Info state - Info icon
                if ((currentScan as { isInfo?: boolean } | null)?.isInfo) {
                  return (
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  );
                }
                // Success states
                return currentScan?.action === 'checked_in' ||
                  currentScan?.action === 'transferred' ? (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                );
              })()}
            </div>
          )}

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
            {(() => {
              if (isPickupQueryHeadingState) {
                return texts.pickupQueryHeading;
              }

              // Feedback prompt
              if (showFeedbackPrompt) {
                const firstName = checkoutDestinationState?.studentName?.split(' ')[0] ?? '';
                return texts.feedbackHeading(firstName);
              }

              // Farewell state after "nach Hause" feedback
              if (checkoutDestinationState?.showingFarewell) {
                const firstName = checkoutDestinationState.studentName.split(' ')[0];
                return texts.farewellHeading(firstName);
              }

              // Supervisor authentication - prefer custom message (e.g., redirect hint)
              if (currentScan?.action === 'supervisor_authenticated') {
                if (currentScan.message) return currentScan.message;

                const roomName = selectedRoom?.name ?? texts.supervisorRoomFallback;
                return texts.supervisorHeading(currentScan.student_name, roomName);
              }

              // Error/Info states use student_name as the title
              if (
                (currentScan as { showAsError?: boolean } | null)?.showAsError ||
                (currentScan as { isInfo?: boolean } | null)?.isInfo
              ) {
                return currentScan?.student_name ?? '';
              }

              if (currentScan?.action === 'pickup_info') {
                const firstName = (currentScan?.student_name ?? '').split(' ')[0];
                return texts.pickupInfoHeading(firstName);
              }

              // Check-in: use backend message if available, otherwise default greeting
              if (currentScan?.action === 'checked_in') {
                return currentScan.message ?? texts.checkinGreeting(currentScan.student_name);
              }

              // Checkout with destination buttons: ask where the student is going
              if (
                currentScan?.action === 'checked_out' &&
                checkoutDestinationState &&
                !checkoutDestinationState.showingFarewell
              ) {
                const firstName = (currentScan?.student_name ?? '').split(' ')[0];
                return texts.destinationQuestionHeading(firstName);
              }

              // Checkout farewell: after destination selected or no destinations available
              if (currentScan?.action === 'checked_out') {
                const firstName = (currentScan?.student_name ?? '').split(' ')[0];
                return texts.farewellHeading(firstName);
              }

              // Fallback: use backend message or student name
              return currentScan?.message ?? currentScan?.student_name ?? '';
            })()}
          </h2>

          {/* Content area for message or button */}
          {renderModalContent()}
        </ModalBase>
      )}

      {/* Keyframes for center RFID processing spinner */}
      <style>{`
        @keyframes rfid-center-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default ActivityScanningPage;
