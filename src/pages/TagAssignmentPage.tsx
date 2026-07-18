import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalActionButtons, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import RfidProcessingIndicator from '../components/ui/RfidProcessingIndicator';
import { getAssignedPerson, useTagAssignmentScan } from '../hooks/useTagAssignmentScan';
import { type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { logNavigation, logUserAction } from '../utils/logger';
import { pressHandlers } from '../utils/pressHandlers';

/** User-facing German UI copy for this page */
const texts = {
  title: 'Armband identifizieren',
  scannerHeading: 'Armband wird erkannt...',
  scannerHint: 'Halten Sie das Armband an das Lesegerät',
  cancelButton: 'Abbrechen',
  startInstructionLine1: 'Drücken Sie den Knopf und halten Sie',
  startInstructionLine2: 'das Armband an das Lesegerät',
  startScanButton: 'Scan starten',
  processing: 'Verarbeite...',
  tagRecognized: 'Armband erkannt',
  currentlyAssignedTo: 'Aktuell zugewiesen an:',
  staffLabel: 'Betreuer',
  tagNotAssigned: 'Armband ist nicht zugewiesen',
  reassignButton: 'Anderer Person zuweisen',
  selectPersonButton: 'Person auswählen',
  newScanButton: 'Neuer Scan',
  unassignButton: 'Armband freigeben',
  successHeading: 'Erfolgreich!',
  scanAnotherButton: 'Weiteres Armband scannen',
  backButton: 'Zurück',
  unassignConfirmHeading: 'Armband freigeben?',
  unassignConfirmPrefix: 'Das Armband wird von',
  unassignConfirmSuffix: 'entfernt.',
  unassignConfirmHint: 'Keine Sorge, das Armband kann jederzeit neu zugewiesen werden.',
  unassigningButton: 'Wird entfernt...',
  confirmUnassignButton: 'Ja, freigeben',
  fallbackChildName: 'Kind',
  assignmentSuccess: (name: string) => `${name} hat jetzt dieses Armband.`,
  invalidDataError: 'Ungültige Daten. Bitte erneut scannen.',
} as const;

/**
 * Tag Assignment Page - Handle RFID tag assignment to students
 *
 * Workflow:
 * 1. Teacher clicks "Scan RFID Tag" button
 * 2. RFID scanner modal opens (future integration)
 * 3. Tag is scanned, check current assignment
 * 4. Show assignment options with student dropdown
 * 5. Assign tag to selected student
 * 6. Show confirmation and options to continue or go back
 */
function TagAssignmentPage() {
  const { authenticatedUser } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isLoading,
    showScanner,
    scannedTag,
    tagAssignment,
    error,
    showErrorModal,
    success,
    showUnassignConfirm,
    isUnassigning,
    startScanning,
    cancelScan,
    scanAnother,
    unassignTag,
    openUnassignConfirm,
    closeUnassignConfirm,
    closeErrorModal,
    showError,
    restoreScan,
    setSuccess,
  } = useTagAssignmentScan();

  // Handle back navigation
  const handleBack = () => {
    logNavigation('Tag Assignment', '/home');
    void navigate('/home');
  };

  // Handle state from student selection page (success or back navigation)
  useEffect(() => {
    const locationState = location.state as {
      assignmentSuccess?: boolean;
      studentName?: string;
      previousTag?: string;
      scannedTag?: string;
      tagAssignment?: TagAssignmentCheck;
    } | null;

    if (!locationState) return;

    const { scannedTag, tagAssignment } = locationState;

    // Restore tag data if coming back from student selection
    if (scannedTag && tagAssignment) {
      restoreScan(scannedTag, tagAssignment);
    }

    // Handle success state
    if (locationState.assignmentSuccess) {
      setSuccess(texts.assignmentSuccess(locationState.studentName ?? texts.fallbackChildName));
    }

    // Clear location state to prevent showing on page refresh
    window.history.replaceState({}, document.title);
  }, [location.state, restoreScan, setSuccess]);

  // Navigate to student selection
  const handleNavigateToStudentSelection = () => {
    if (!scannedTag || !tagAssignment) {
      showError(texts.invalidDataError);
      return;
    }

    logUserAction('Navigating to student selection', {
      tagId: scannedTag,
      currentlyAssigned: tagAssignment.assigned,
    });

    void navigate('/student-selection', {
      state: {
        scannedTag,
        tagAssignment,
      },
    });
  };

  // Redirect to login if no authenticated user
  useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Tag Assignment', '/');
      void navigate('/');
    }
  }, [authenticatedUser, navigate]);

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  const isScanStartDisabled = isLoading;

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
          {/* Back button */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 10,
            }}
          >
            <BackButton onClick={handleBack} />
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: '56px',
              fontWeight: 700,
              marginTop: '40px',
              marginBottom: '20px',
              textAlign: 'center',
              color: designSystem.gray[900],
            }}
          >
            {texts.title}
          </h1>

          {/* Scanner Modal Overlay
              The 18s modal timeout was sized for the retired Tauri/Pi hardware path
              (backend stop 3s + SPI mutex 3s + hardware scan 10s = 16s worst-case)
              and is kept as a generous upper bound for GKT/mock scanning. */}
          <ModalBase
            isOpen={showScanner}
            onClose={cancelScan}
            size="md"
            backgroundColor={designSystem.brand.blue}
            timeout={18000}
          >
            {/* Icon container */}
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
              <FontAwesomeIcon
                icon={faWifi}
                size="4x"
                style={{ color: designSystem.colors.white, transform: 'rotate(90deg)' }}
              />
            </div>

            <h2
              style={{
                fontSize: '36px',
                fontWeight: 700,
                marginBottom: '16px',
                color: designSystem.colors.white,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {texts.scannerHeading}
            </h2>
            <p
              style={{
                fontSize: '20px',
                color: 'rgba(255, 255, 255, 0.9)',
                marginBottom: '32px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {texts.scannerHint}
            </p>

            <button
              onClick={cancelScan}
              {...pressHandlers()}
              style={{
                padding: '12px 32px',
                fontSize: '18px',
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: designSystem.colors.white,
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: designSystem.borderRadius.xl,
                cursor: 'pointer',
                outline: 'none',
                transition: designSystem.transitions.base,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {texts.cancelButton}
            </button>
          </ModalBase>

          {/* Main Content - Centered */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Initial State - Start Scanning */}
            {!scannedTag && !isLoading && !success && (
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: '140px',
                    height: '140px',
                    backgroundColor: 'rgba(80, 128, 216, 0.12)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 40px',
                  }}
                >
                  <FontAwesomeIcon
                    icon={faWifi}
                    size="5x"
                    style={{ color: designSystem.brand.blue, transform: 'rotate(90deg)' }}
                  />
                </div>

                <p
                  style={{
                    fontSize: '24px',
                    color: designSystem.colors.textSubtle,
                    marginBottom: '40px',
                    lineHeight: '1.4',
                  }}
                >
                  {texts.startInstructionLine1}
                  <br />
                  {texts.startInstructionLine2}
                </p>

                <button
                  onClick={startScanning}
                  disabled={isScanStartDisabled}
                  style={{
                    height: '68px',
                    padding: '0 64px',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: designSystem.colors.white,
                    backgroundColor: isScanStartDisabled
                      ? designSystem.gray[400]
                      : designSystem.flat.action,
                    border: 'none',
                    borderRadius: designSystem.borderRadius.full,
                    cursor: isScanStartDisabled ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    boxShadow: isScanStartDisabled ? 'none' : designSystem.shadows.md,
                    opacity: isScanStartDisabled ? 0.6 : 1,
                    transition: designSystem.transitions.base,
                  }}
                  onTouchStart={e => {
                    if (!isScanStartDisabled) {
                      e.currentTarget.style.transform = designSystem.scales.active;
                      e.currentTarget.style.boxShadow = designSystem.shadows.button;
                    }
                  }}
                  onTouchEnd={e => {
                    if (!isScanStartDisabled) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = designSystem.shadows.md;
                    }
                  }}
                >
                  {texts.startScanButton}
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    border: `4px solid ${designSystem.gray[200]}`,
                    borderTopColor: designSystem.gray[900],
                    borderRadius: '50%',
                    margin: '0 auto 32px',
                  }}
                />
                <p
                  style={{
                    fontSize: '24px',
                    color: designSystem.colors.textSubtle,
                    fontWeight: 500,
                  }}
                >
                  {texts.processing}
                </p>
              </div>
            )}

            {/* Tag Scanned - Show Assignment Options */}
            {scannedTag && tagAssignment && !isLoading && !success && (
              <div style={{ width: '100%', maxWidth: '600px' }}>
                {/* Tag Display Card - modern clean style */}
                <div
                  style={{
                    backgroundColor: designSystem.surface.background,
                    border: `1px solid ${designSystem.surface.border}`,
                    borderRadius: designSystem.surface.borderRadius,
                    padding: '24px',
                    textAlign: 'center',
                    boxShadow: designSystem.surface.shadow,
                    marginBottom: '24px',
                  }}
                >
                  {/* Success heading */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      color: designSystem.brand.greenText,
                      fontSize: '22px',
                      fontWeight: 700,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={designSystem.brand.green}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>{texts.tagRecognized}</span>
                  </div>

                  {/* Current Assignment Status */}
                  {(() => {
                    const assignedPerson = getAssignedPerson(tagAssignment);
                    return assignedPerson ? (
                      <div>
                        <p
                          style={{
                            fontSize: '16px',
                            color: designSystem.gray[500],
                            marginBottom: '8px',
                          }}
                        >
                          {texts.currentlyAssignedTo}
                        </p>
                        <p
                          style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: designSystem.gray[800],
                            marginBottom: '4px',
                          }}
                        >
                          {assignedPerson.name}
                        </p>
                        <p
                          style={{
                            fontSize: '18px',
                            color: designSystem.gray[500],
                          }}
                        >
                          {tagAssignment.person_type === 'staff'
                            ? texts.staffLabel
                            : assignedPerson.group}
                        </p>
                      </div>
                    ) : null;
                  })() ?? (
                    <div
                      style={{
                        backgroundColor: designSystem.gray[50],
                        border: `1px solid ${designSystem.gray[200]}`,
                        borderRadius: designSystem.borderRadius.md,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={designSystem.gray[400]}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span
                        style={{ fontSize: '16px', color: designSystem.gray[500], fontWeight: 600 }}
                      >
                        {texts.tagNotAssigned}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    alignItems: 'center',
                    marginTop: '32px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '16px',
                      justifyContent: 'center',
                      width: '100%',
                    }}
                  >
                    <button
                      onClick={handleNavigateToStudentSelection}
                      style={{
                        flex: 1,
                        height: '68px',
                        fontSize: '24px',
                        fontWeight: 700,
                        color: designSystem.colors.white,
                        backgroundColor: designSystem.flat.action,
                        border: 'none',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: designSystem.shadows.md,
                        transition: designSystem.transitions.base,
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.transform = designSystem.scales.active;
                        e.currentTarget.style.boxShadow = designSystem.shadows.button;
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = designSystem.shadows.md;
                      }}
                    >
                      {tagAssignment.assigned ? texts.reassignButton : texts.selectPersonButton}
                    </button>
                    <button
                      onClick={scanAnother}
                      style={{
                        flex: 1,
                        height: '68px',
                        fontSize: '24px',
                        fontWeight: 700,
                        backgroundColor: designSystem.colors.white,
                        color: designSystem.gray[700],
                        border: `1px solid ${designSystem.gray[300]}`,
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: designSystem.transitions.base,
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.backgroundColor = designSystem.gray[50];
                        e.currentTarget.style.borderColor = designSystem.gray[400];
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.backgroundColor = designSystem.colors.white;
                        e.currentTarget.style.borderColor = designSystem.gray[300];
                      }}
                    >
                      {texts.newScanButton}
                    </button>
                  </div>

                  {/* Unassign button */}
                  {tagAssignment.assigned && (
                    <button
                      onClick={openUnassignConfirm}
                      style={{
                        height: '56px',
                        padding: '0 40px',
                        fontSize: '20px',
                        fontWeight: 600,
                        backgroundColor: 'transparent',
                        color: designSystem.brand.red,
                        border: '2px solid rgba(255, 49, 48, 0.3)',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: designSystem.transitions.base,
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.backgroundColor = designSystem.brand.redPillBg;
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {texts.unassignButton}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Success State */}
            {success && (
              <div style={{ textAlign: 'center', width: '100%', maxWidth: '500px' }}>
                <div
                  style={{
                    width: '120px',
                    height: '120px',
                    backgroundColor: designSystem.brand.greenPillBg,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 32px',
                  }}
                >
                  <svg
                    width="60"
                    height="60"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={designSystem.brand.green}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h2
                  style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    marginBottom: '16px',
                    color: designSystem.brand.greenText,
                  }}
                >
                  {texts.successHeading}
                </h2>
                <p
                  style={{
                    fontSize: '20px',
                    color: designSystem.gray[500],
                    marginBottom: '48px',
                    lineHeight: 1.5,
                  }}
                >
                  {success}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    justifyContent: 'center',
                  }}
                >
                  <button
                    onClick={scanAnother}
                    {...pressHandlers()}
                    style={{
                      height: '68px',
                      padding: '0 40px',
                      fontSize: '20px',
                      fontWeight: 600,
                      backgroundColor: designSystem.flat.action,
                      color: designSystem.colors.white,
                      border: 'none',
                      borderRadius: designSystem.borderRadius.full,
                      cursor: 'pointer',
                      outline: 'none',
                      transition: designSystem.transitions.base,
                      boxShadow: designSystem.shadows.md,
                    }}
                  >
                    {texts.scanAnotherButton}
                  </button>
                  <button
                    onClick={handleBack}
                    {...pressHandlers()}
                    style={{
                      height: '68px',
                      padding: '0 40px',
                      fontSize: '20px',
                      fontWeight: 600,
                      backgroundColor: designSystem.colors.white,
                      color: designSystem.gray[700],
                      border: `1px solid ${designSystem.gray[300]}`,
                      borderRadius: designSystem.borderRadius.full,
                      cursor: 'pointer',
                      outline: 'none',
                      transition: designSystem.transitions.base,
                    }}
                  >
                    {texts.backButton}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </BackgroundWrapper>

      {/* Unassign Confirmation Modal */}
      <ModalBase
        isOpen={showUnassignConfirm}
        onClose={() => {
          if (!isUnassigning) closeUnassignConfirm();
        }}
        size="sm"
        backgroundColor={designSystem.colors.white}
      >
        <div style={{ textAlign: 'center' }}>
          {/* X close icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={designSystem.brand.red}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: '16px' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>

          <h2
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: designSystem.gray[900],
              marginBottom: '12px',
            }}
          >
            {texts.unassignConfirmHeading}
          </h2>
          <p
            style={{
              fontSize: '18px',
              color: designSystem.gray[500],
              lineHeight: 1.5,
              marginBottom: '8px',
            }}
          >
            {texts.unassignConfirmPrefix}{' '}
            <strong style={{ color: designSystem.gray[900] }}>
              {getAssignedPerson(tagAssignment)?.name}
            </strong>{' '}
            {texts.unassignConfirmSuffix}
          </p>
          <p
            style={{
              fontSize: '16px',
              color: designSystem.gray[400],
              lineHeight: 1.5,
              marginBottom: '32px',
            }}
          >
            {texts.unassignConfirmHint}
          </p>

          <ModalActionButtons
            onCancel={closeUnassignConfirm}
            onConfirm={unassignTag}
            isLoading={isUnassigning}
            cancelLabel={texts.cancelButton}
            confirmLabel={texts.confirmUnassignButton}
            loadingLabel={texts.unassigningButton}
            // destructive tag freigeben → red-600 (#DC2626), §4b
            confirmGradient={designSystem.flat.dangerHover}
          />
        </div>
      </ModalBase>

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={closeErrorModal}
        message={error ?? ''}
        autoCloseDelay={3000}
      />

      {/* Bottom-left spinner: visible between RFID tag detection and API response */}
      <RfidProcessingIndicator isVisible={isLoading && !!scannedTag} />
    </>
  );
}

export default TagAssignmentPage;
