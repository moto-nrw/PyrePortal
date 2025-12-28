import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { api, type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { logNavigation, logUserAction, logError, createLogger } from '../utils/logger';
import { safeInvoke, isTauriContext, isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('TagAssignmentPage');

/**
 * Helper to get assigned person from TagAssignmentCheck
 */
const getAssignedPerson = (assignment: TagAssignmentCheck | null) => {
  if (!assignment?.assigned) return null;
  return assignment.person ?? null;
};

// RFID scanner types from Tauri backend
interface RfidScanResult {
  success: boolean;
  tag_id?: string;
  error?: string;
}

interface RfidScannerStatus {
  is_available: boolean;
  platform: string;
  last_error?: string;
}

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

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedTag, setScannedTag] = useState<string | null>(null);
  const [tagAssignment, setTagAssignment] = useState<TagAssignmentCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<RfidScannerStatus | null>(null);

  const clearStates = useCallback(() => {
    setScannedTag(null);
    setTagAssignment(null);
    setError(null);
    setSuccess(null);
  }, []);

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
      setScannedTag(scannedTag);
      setTagAssignment(tagAssignment);
    }

    // Handle success state
    if (locationState.assignmentSuccess) {
      const { studentName, previousTag } = locationState;

      let successMessage = `Armband erfolgreich zugewiesen an ${studentName ?? 'Person'}`;
      if (previousTag) {
        successMessage += ` (Vorheriges Armband: ${previousTag})`;
      }

      setSuccess(successMessage);
    }

    // Clear location state to prevent showing on page refresh
    window.history.replaceState({}, document.title);
  }, [location.state]);

  // Check RFID scanner status on component mount
  useEffect(() => {
    const checkScannerStatus = async () => {
      logger.debug('Checking RFID scanner status');

      if (!isTauriContext()) {
        logger.debug('Not in Tauri context, using development status');
        setScannerStatus({
          is_available: false,
          platform: 'Development (Web)',
          last_error: 'Tauri context not available in development mode',
        });
        return;
      }

      try {
        logger.debug('Calling get_rfid_scanner_status');
        const status = await safeInvoke<RfidScannerStatus>('get_rfid_scanner_status');
        logger.debug('Scanner status received', { status });
        setScannerStatus(status);
        logUserAction('RFID scanner status checked', {
          platform: status.platform,
          available: status.is_available,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Scanner status error', { error: error.message });
        logError(error, 'Failed to check RFID scanner status');
        setScannerStatus({
          is_available: false,
          platform: 'Unknown',
          last_error: error.message,
        });
      }
    };

    void checkScannerStatus();
  }, []);

  // Start RFID scanning process
  const handleStartScanning = async () => {
    logUserAction('RFID scanning started');

    clearStates();
    setShowScanner(true);
    setIsLoading(true);

    try {
      if (!isRfidEnabled()) {
        // Development mock behavior
        setTimeout(() => {
          // Get mock tags from environment variable or use defaults
          const envTags = import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined;
          const mockStudentTags: string[] = envTags
            ? envTags.split(',').map(tag => tag.trim())
            : [
                // Default realistic hardware format tags
                '04:D6:94:82:97:6A:80',
                '04:A7:B3:C2:D1:E0:F5',
                '04:12:34:56:78:9A:BC',
                '04:FE:DC:BA:98:76:54',
                '04:11:22:33:44:55:66',
              ];

          // Pick a random tag from the list
          const mockTagId = mockStudentTags[Math.floor(Math.random() * mockStudentTags.length)];
          logUserAction('Mock RFID tag scanned', { tagId: mockTagId, platform: 'Development' });
          void handleTagScanned(mockTagId);
        }, 2000);
        return;
      }

      // Use real RFID scanner through Tauri
      const result = await safeInvoke<RfidScanResult>('scan_rfid_single');

      if (result.success && result.tag_id) {
        logUserAction('RFID tag scanned successfully', {
          tagId: result.tag_id,
          platform: scannerStatus?.platform,
        });
        void handleTagScanned(result.tag_id);
      } else {
        const errorMessage = result.error ?? 'Unknown scanning error';
        logError(new Error(errorMessage), 'RFID scanning failed');
        setError('Armband konnte nicht gelesen werden. Bitte erneut versuchen.');
        setShowErrorModal(true);
        setShowScanner(false);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'RFID scanner invocation failed');
      setError('Verbindung zum Scanner unterbrochen. Bitte App neu starten.');
      setShowErrorModal(true);
      setShowScanner(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle tag scanned (connection point for RFID module)
  const handleTagScanned = async (tagId: string) => {
    setIsLoading(true);
    setShowScanner(false);
    setScannedTag(tagId);

    try {
      logUserAction('RFID tag scanned', { tagId });

      // Check if tag is already assigned
      const assignment = await checkTagAssignment(tagId);
      setTagAssignment(assignment);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'Failed to process scanned tag');
      setError('Armband konnte nicht überprüft werden. Bitte Internetverbindung prüfen.');
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Check current tag assignment
  const checkTagAssignment = async (tagId: string): Promise<TagAssignmentCheck> => {
    if (!authenticatedUser?.pin) {
      throw new Error('Keine Authentifizierung verfügbar');
    }

    return await api.checkTagAssignment(authenticatedUser.pin, tagId);
  };

  // Navigate to student selection
  const handleNavigateToStudentSelection = () => {
    if (!scannedTag || !tagAssignment) {
      setError('Ungültige Daten. Bitte erneut scannen.');
      setShowErrorModal(true);
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

  // Start a new scan
  const handleScanAnother = () => {
    logUserAction('Starting new tag scan');
    clearStates();
    void handleStartScanning();
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
            Armband scannen
          </h1>

          {/* Scanner Modal Overlay
              IMPORTANT: timeout must match Rust scan_rfid_hardware_single() timeout in src-tauri/src/rfid.rs (currently 10s) */}
          <ModalBase
            isOpen={showScanner}
            onClose={() => setShowScanner(false)}
            size="md"
            backgroundColor="#5080D8"
            timeout={10000}
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
              Armband scannen...
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
              Halten Sie das Armband an den Scanner
            </p>

            <button
              onClick={() => setShowScanner(false)}
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
            {!scannedTag && !isLoading && (
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
                  onClick={handleStartScanning}
                  disabled={isLoading || (!scannerStatus?.is_available && isTauriContext())}
                  style={{
                    height: '68px',
                    padding: '0 64px',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    background:
                      isLoading || (!scannerStatus?.is_available && isTauriContext())
                        ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                        : designSystem.gradients.blueRight,
                    border: 'none',
                    borderRadius: designSystem.borderRadius.full,
                    cursor:
                      isLoading || (!scannerStatus?.is_available && isTauriContext())
                        ? 'not-allowed'
                        : 'pointer',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow:
                      isLoading || (!scannerStatus?.is_available && isTauriContext())
                        ? 'none'
                        : designSystem.shadows.blue,
                    opacity:
                      isLoading || (!scannerStatus?.is_available && isTauriContext()) ? 0.6 : 1,
                  }}
                  onTouchStart={e => {
                    if (!(isLoading || (!scannerStatus?.is_available && isTauriContext()))) {
                      e.currentTarget.style.transform = designSystem.scales.active;
                      e.currentTarget.style.boxShadow = designSystem.shadows.button;
                    }
                  }}
                  onTouchEnd={e => {
                    if (!(isLoading || (!scannerStatus?.is_available && isTauriContext()))) {
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
                  {/* Tag ID label */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      borderRadius: '9999px',
                      marginBottom: '16px',
                      color: '#1F2937',
                      fontSize: '14px',
                      fontWeight: 700,
                    }}
                  >
                    {scannedTag}
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
                    gap: '16px',
                    justifyContent: 'center',
                    marginTop: '32px',
                  }}
                >
                  <button
                    onClick={handleNavigateToStudentSelection}
                    disabled={isLoading}
                    style={{
                      flex: 1,
                      height: '68px',
                      fontSize: '24px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      background: isLoading
                        ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                        : designSystem.gradients.blueRight,
                      border: 'none',
                      borderRadius: designSystem.borderRadius.full,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: isLoading ? 'none' : designSystem.shadows.blue,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                    onTouchStart={e => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = designSystem.scales.active;
                        e.currentTarget.style.boxShadow = designSystem.shadows.button;
                      }
                    }}
                    onTouchEnd={e => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = designSystem.shadows.blue;
                      }
                    }}
                  >
                    {tagAssignment.assigned ? 'Neue Person zuweisen' : 'Person auswählen'}
                  </button>
                  <button
                    onClick={handleScanAnother}
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
                      WebkitTapHighlightColor: 'transparent',
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
                    onClick={handleScanAnother}
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
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: '0 4px 16px rgba(80, 128, 216, 0.3)',
                    }}
                  >
                    Weiteres Armband scannen
                  </button>
                  <button
                    onClick={handleBack}
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
                      WebkitTapHighlightColor: 'transparent',
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

      {/* Error Modal */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={error ?? ''}
        autoCloseDelay={3000}
      />
    </>
  );
}

export default TagAssignmentPage;
