import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
import { api, type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { logNavigation, logUserAction, logError, createLogger } from '../utils/logger';
import { safeInvoke, isTauriContext, isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('TagAssignmentPage');

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

  // Handle success state from student selection page
  useEffect(() => {
    const locationState = location.state as {
      assignmentSuccess?: boolean;
      studentName?: string;
      previousTag?: string;
      scannedTag?: string;
      tagAssignment?: TagAssignmentCheck;
    } | null;
    
    if (locationState?.assignmentSuccess) {
      const { studentName, previousTag, scannedTag, tagAssignment } = locationState;
      
      // Restore tag data if coming back from student selection
      if (scannedTag && tagAssignment) {
        setScannedTag(scannedTag);
        setTagAssignment(tagAssignment);
      }
      
      let successMessage = `Tag erfolgreich zugewiesen an ${studentName ?? 'Schüler'}`;
      if (previousTag) {
        successMessage += ` (Vorheriger Tag: ${previousTag})`;
      }
      
      setSuccess(successMessage);
      
      // Clear location state to prevent showing success on page refresh
      window.history.replaceState({}, document.title);
    }
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
        setError(`Scan-Fehler: ${errorMessage}`);
        setShowErrorModal(true);
        setShowScanner(false);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'RFID scanner invocation failed');
      setError(`Scanner-Fehler: ${error.message}`);
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
      const errorMessage = error.message;
      logError(error, 'Failed to process scanned tag');
      setError(`Fehler beim Verarbeiten des Tags: ${errorMessage}`);
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
      setError('Ungültige Tag-Daten. Bitte scannen Sie erneut.');
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
          {/* Modern back button */}
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
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                position: 'relative',
                overflow: 'hidden',
                backdropFilter: 'blur(8px)',
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

          {/* Title */}
          <h1
            style={{
              fontSize: '36px',
              fontWeight: theme.fonts.weight.bold,
              marginBottom: '48px',
              textAlign: 'center',
              color: theme.colors.text.primary,
            }}
          >
            Tag zuweisen
          </h1>

          {/* Scanner Modal Overlay */}
          {showScanner && (
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
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  backgroundColor: '#5080D8',
                  borderRadius: '32px',
                  padding: '64px',
                  maxWidth: '600px',
                  width: '90%',
                  textAlign: 'center',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
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
                  RFID Tag scannen...
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
                  {scannerStatus?.platform.includes('Development')
                    ? 'Simuliere Scan-Vorgang...'
                    : 'Halten Sie das Armband an den Scanner'}
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
              </div>
            </div>
          )}

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
                  Wählen Sie einen Schüler aus,
                  <br />
                  um ein Tag zuzuweisen
                </p>

                <button
                  onClick={handleStartScanning}
                  disabled={isLoading || (!scannerStatus?.is_available && isTauriContext())}
                  style={{
                    height: '60px',
                    padding: '0 48px',
                    fontSize: '20px',
                    fontWeight: 600,
                    backgroundColor: '#5080D8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: '0 6px 20px rgba(80, 128, 216, 0.3)',
                    opacity:
                      isLoading || (!scannerStatus?.is_available && isTauriContext()) ? 0.5 : 1,
                  }}
                >
                  Schüler auswählen
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
                {/* Tag Display Card */}
                <div
                  style={{
                    background: 'linear-gradient(to right, #5080D8, #3f6bc4)',
                    borderRadius: '24px',
                    padding: '3px',
                    marginBottom: '32px',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '21px',
                      padding: '32px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 24px',
                        backgroundColor: '#F3F4F6',
                        borderRadius: '16px',
                        marginBottom: '20px',
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#5080D8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: '#374151' }}>
                        Tag: {scannedTag}
                      </span>
                    </div>

                    {/* Current Assignment Status */}
                    {tagAssignment.assigned && tagAssignment.student ? (
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
                          {tagAssignment.student.name}
                        </p>
                        <p
                          style={{
                            fontSize: '18px',
                            color: '#6B7280',
                          }}
                        >
                          {tagAssignment.student.group}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            backgroundColor: '#FEF3C7',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                          }}
                        >
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#F59E0B"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </div>
                        <p
                          style={{
                            fontSize: '20px',
                            color: '#6B7280',
                            fontWeight: 500,
                          }}
                        >
                          Tag ist nicht zugewiesen
                        </p>
                      </div>
                    )}
                  </div>
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
                      height: '56px',
                      fontSize: '18px',
                      fontWeight: 600,
                      backgroundColor: '#5080D8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '28px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: '0 4px 16px rgba(80, 128, 216, 0.3)',
                    }}
                  >
                    {tagAssignment.assigned ? 'Neuen Schüler zuweisen' : 'Schüler auswählen'}
                  </button>
                  <button
                    onClick={handleScanAnother}
                    style={{
                      flex: 1,
                      height: '56px',
                      fontSize: '18px',
                      fontWeight: 600,
                      backgroundColor: 'white',
                      color: '#374151',
                      border: '2px solid #E5E7EB',
                      borderRadius: '28px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
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
                      height: '56px',
                      padding: '0 32px',
                      fontSize: '18px',
                      fontWeight: 600,
                      backgroundColor: '#5080D8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '28px',
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
                      height: '56px',
                      padding: '0 32px',
                      fontSize: '18px',
                      fontWeight: 600,
                      backgroundColor: 'white',
                      color: '#374151',
                      border: '2px solid #E5E7EB',
                      borderRadius: '28px',
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
      </ContentBox>

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
