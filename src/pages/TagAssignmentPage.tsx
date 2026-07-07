import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import RfidProcessingIndicator from '../components/ui/RfidProcessingIndicator';
import { getAssignedPerson, useTagAssignmentScan } from '../hooks/useTagAssignmentScan';
import { type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { logNavigation, logUserAction } from '../utils/logger';
import { pressHandlers } from '../utils/pressHandlers';

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
      setSuccess(`${locationState.studentName ?? 'Kind'} hat jetzt dieses Armband.`);
    }

    // Clear location state to prevent showing on page refresh
    window.history.replaceState({}, document.title);
  }, [location.state, restoreScan, setSuccess]);

  // Navigate to student selection
  const handleNavigateToStudentSelection = () => {
    if (!scannedTag || !tagAssignment) {
      showError('Ungültige Daten. Bitte erneut scannen.');
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
              color: '#111827',
            }}
          >
            Armband identifizieren
          </h1>

          {/* Scanner Modal Overlay
              The 18s modal timeout was sized for the retired Tauri/Pi hardware path
              (backend stop 3s + SPI mutex 3s + hardware scan 10s = 16s worst-case)
              and is kept as a generous upper bound for GKT/mock scanning. */}
          <ModalBase
            isOpen={showScanner}
            onClose={cancelScan}
            size="md"
            backgroundColor="#5080D8"
            timeout={18000}
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
                style={{ color: 'white', transform: 'rotate(90deg)' }}
              />
            </div>

            <h2
              style={{
                fontSize: '36px',
                fontWeight: 700,
                marginBottom: '16px',
                color: '#FFFFFF',
                position: 'relative',
                zIndex: 2,
              }}
            >
              Armband wird erkannt...
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
              Halten Sie das Armband an das Lesegerät
            </p>

            <button
              onClick={cancelScan}
              {...pressHandlers()}
              style={{
                padding: '12px 32px',
                fontSize: '18px',
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '24px',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 200ms',
                position: 'relative',
                zIndex: 2,
              }}
            >
              Abbrechen
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
                    backgroundColor: '#E6EFFF',
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
                    style={{ color: '#5080D8', transform: 'rotate(90deg)' }}
                  />
                </div>

                <p
                  style={{
                    fontSize: '24px',
                    color: theme.colors.text.secondary,
                    marginBottom: '40px',
                    lineHeight: '1.4',
                  }}
                >
                  Drücken Sie den Knopf und halten Sie
                  <br />
                  das Armband an das Lesegerät
                </p>

                <button
                  onClick={startScanning}
                  disabled={isScanStartDisabled}
                  style={{
                    height: '68px',
                    padding: '0 64px',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    background: isScanStartDisabled
                      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                      : designSystem.gradients.blueRight,
                    border: 'none',
                    borderRadius: designSystem.borderRadius.full,
                    cursor: isScanStartDisabled ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    boxShadow: isScanStartDisabled ? 'none' : designSystem.shadows.blue,
                    opacity: isScanStartDisabled ? 0.6 : 1,
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
                      e.currentTarget.style.boxShadow = designSystem.shadows.blue;
                    }
                  }}
                >
                  Scan starten
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
                    border: '4px solid #E5E7EB',
                    borderTopColor: '#5080D8',
                    borderRadius: '50%',
                    margin: '0 auto 32px',
                  }}
                />
                <p
                  style={{
                    fontSize: '24px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  Verarbeite...
                </p>
              </div>
            )}

            {/* Tag Scanned - Show Assignment Options */}
            {scannedTag && tagAssignment && !isLoading && !success && (
              <div style={{ width: '100%', maxWidth: '600px' }}>
                {/* Tag Display Card - modern clean style */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '2px solid #E5E7EB',
                    borderRadius: '24px',
                    padding: '24px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
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
                      color: '#83CD2D',
                      fontSize: '22px',
                      fontWeight: 700,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#83CD2D"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>Armband erkannt</span>
                  </div>

                  {/* Current Assignment Status */}
                  {(() => {
                    const assignedPerson = getAssignedPerson(tagAssignment);
                    return assignedPerson ? (
                      <div>
                        <p
                          style={{
                            fontSize: '16px',
                            color: '#6B7280',
                            marginBottom: '8px',
                          }}
                        >
                          Aktuell zugewiesen an:
                        </p>
                        <p
                          style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#1F2937',
                            marginBottom: '4px',
                          }}
                        >
                          {assignedPerson.name}
                        </p>
                        <p
                          style={{
                            fontSize: '18px',
                            color: '#6B7280',
                          }}
                        >
                          {tagAssignment.person_type === 'staff'
                            ? 'Betreuer'
                            : assignedPerson.group}
                        </p>
                      </div>
                    ) : null;
                  })() ?? (
                    <div
                      style={{
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        borderRadius: '16px',
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
                        stroke="#9CA3AF"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ fontSize: '16px', color: '#6B7280', fontWeight: 600 }}>
                        Armband ist nicht zugewiesen
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
                        color: '#FFFFFF',
                        background: designSystem.gradients.blueRight,
                        border: 'none',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: designSystem.shadows.blue,
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.transform = designSystem.scales.active;
                        e.currentTarget.style.boxShadow = designSystem.shadows.button;
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = designSystem.shadows.blue;
                      }}
                    >
                      {tagAssignment.assigned ? 'Anderer Person zuweisen' : 'Person auswählen'}
                    </button>
                    <button
                      onClick={scanAnother}
                      style={{
                        flex: 1,
                        height: '68px',
                        fontSize: '24px',
                        fontWeight: 700,
                        backgroundColor: '#FFFFFF',
                        color: '#374151',
                        border: '2px solid #E5E7EB',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                        e.currentTarget.style.borderColor = '#D1D5DB';
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#E5E7EB';
                      }}
                    >
                      Neuer Scan
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
                        color: '#EF4444',
                        border: '2px solid #FCA5A5',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                      onTouchStart={e => {
                        e.currentTarget.style.backgroundColor = '#FEF2F2';
                      }}
                      onTouchEnd={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      Armband freigeben
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
                    backgroundColor: '#E7F7DF',
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
                    stroke="#83cd2d"
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
                    color: '#83cd2d',
                  }}
                >
                  Erfolgreich!
                </h2>
                <p
                  style={{
                    fontSize: '20px',
                    color: '#6B7280',
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
                      backgroundColor: '#5080D8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '34px',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 200ms',
                      boxShadow: '0 4px 16px rgba(80, 128, 216, 0.3)',
                    }}
                  >
                    Weiteres Armband scannen
                  </button>
                  <button
                    onClick={handleBack}
                    {...pressHandlers()}
                    style={{
                      height: '68px',
                      padding: '0 40px',
                      fontSize: '20px',
                      fontWeight: 600,
                      backgroundColor: 'white',
                      color: '#374151',
                      border: '2px solid #E5E7EB',
                      borderRadius: '34px',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 200ms',
                    }}
                  >
                    Zurück
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
        backgroundColor="#FFFFFF"
      >
        <div style={{ textAlign: 'center' }}>
          {/* X close icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#EF4444"
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
              color: '#111827',
              marginBottom: '12px',
            }}
          >
            Armband freigeben?
          </h2>
          <p
            style={{
              fontSize: '18px',
              color: '#6B7280',
              lineHeight: 1.5,
              marginBottom: '8px',
            }}
          >
            Das Armband wird von{' '}
            <strong style={{ color: '#111827' }}>{getAssignedPerson(tagAssignment)?.name}</strong>{' '}
            entfernt.
          </p>
          <p
            style={{
              fontSize: '16px',
              color: '#9CA3AF',
              lineHeight: 1.5,
              marginBottom: '32px',
            }}
          >
            Keine Sorge, das Armband kann jederzeit neu zugewiesen werden.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={unassignTag}
              disabled={isUnassigning}
              {...pressHandlers(isUnassigning)}
              style={{
                height: '52px',
                padding: '0 32px',
                fontSize: '18px',
                fontWeight: 700,
                backgroundColor: isUnassigning ? '#FCA5A5' : '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: designSystem.borderRadius.full,
                cursor: isUnassigning ? 'not-allowed' : 'pointer',
                outline: 'none',
                transition: 'all 200ms',
                opacity: isUnassigning ? 0.7 : 1,
              }}
            >
              {isUnassigning ? 'Wird entfernt...' : 'Ja, freigeben'}
            </button>
            <button
              onClick={closeUnassignConfirm}
              disabled={isUnassigning}
              {...pressHandlers(isUnassigning)}
              style={{
                height: '52px',
                padding: '0 32px',
                fontSize: '18px',
                fontWeight: 700,
                backgroundColor: '#FFFFFF',
                color: '#374151',
                border: '2px solid #E5E7EB',
                borderRadius: designSystem.borderRadius.full,
                cursor: isUnassigning ? 'not-allowed' : 'pointer',
                outline: 'none',
                transition: 'all 200ms',
                opacity: isUnassigning ? 0.5 : 1,
              }}
            >
              Abbrechen
            </button>
          </div>
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
