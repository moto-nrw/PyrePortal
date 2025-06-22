import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox, ErrorModal, BackButton } from '../components/ui';
import { api, type AttendanceStatusResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { logNavigation, logUserAction, logError, createLogger } from '../utils/logger';
import { safeInvoke, isTauriContext, isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('AttendancePage');

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
 * Attendance Page - Handle student attendance check-in/check-out via RFID scanning
 *
 * Workflow:
 * 1. Teacher clicks "Scan RFID Tag" button
 * 2. RFID scanner modal opens
 * 3. Tag is scanned, get student attendance status
 * 4. Show student info and current status (checked_in/checked_out/not_checked_in)
 * 5. Teacher can confirm check-in/check-out action
 * 6. Show confirmation and options to continue or go back
 */
function AttendancePage() {
  const { authenticatedUser } = useUserStore();
  const navigate = useNavigate();

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedTag, setScannedTag] = useState<string | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<RfidScannerStatus | null>(null);

  const clearStates = useCallback(() => {
    setScannedTag(null);
    setAttendanceStatus(null);
    setError(null);
    setSuccess(null);
  }, []);

  // Handle back navigation
  const handleBack = () => {
    logNavigation('Attendance', '/home');
    void navigate('/home');
  };

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
    logUserAction('Attendance RFID scanning started');

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
            ? envTags.split(',').map((tag) => tag.trim())
            : [
                // Default realistic hardware format tags
                '04:D6:94:82:97:6A:80',
                '04:A7:B3:C2:D1:E0:F5',
                '04:12:34:56:78:9A:BC',
                '04:FE:DC:BA:98:76:54',
                '04:11:22:33:44:55:66'
              ];
          
          // Pick a random tag from the list
          const mockTagId = mockStudentTags[Math.floor(Math.random() * mockStudentTags.length)];
          logUserAction('Mock RFID tag scanned for attendance', { tagId: mockTagId, platform: 'Development' });
          void handleTagScanned(mockTagId);
        }, 2000);
        return;
      }

      // Use real RFID scanner through Tauri
      const result = await safeInvoke<RfidScanResult>('scan_rfid_single');

      if (result.success && result.tag_id) {
        logUserAction('RFID tag scanned successfully for attendance', {
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
      logUserAction('RFID tag scanned for attendance', { tagId });

      // Get student attendance status
      const status = await getAttendanceStatus(tagId);
      setAttendanceStatus(status);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = error.message;
      logError(error, 'Failed to get attendance status');
      setError(`Fehler beim Abrufen des Anwesenheitsstatus: ${errorMessage}`);
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Get attendance status for student
  const getAttendanceStatus = async (tagId: string): Promise<AttendanceStatusResponse> => {
    if (!authenticatedUser?.pin) {
      throw new Error('Keine Authentifizierung verfügbar');
    }
    
    return await api.getAttendanceStatus(authenticatedUser.pin, authenticatedUser.staffId, tagId);
  };

  // Toggle attendance (check-in/check-out)
  const handleToggleAttendance = async () => {
    if (!scannedTag || !authenticatedUser?.pin) {
      setError('Ungültige Auswahl. Bitte versuchen Sie es erneut.');
      setShowErrorModal(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      logUserAction('Attendance toggle initiated', {
        tagId: scannedTag,
        currentStatus: attendanceStatus?.data.attendance.status,
      });

      // Call the attendance toggle API
      const result = await api.toggleAttendance(
        authenticatedUser.pin, 
        authenticatedUser.staffId, 
        scannedTag, 
        'confirm'
      );

      if (result.status === 'success' && result.data.action !== 'cancelled') {
        const studentName = `${result.data.student.first_name} ${result.data.student.last_name}`;
        const action = result.data.action === 'checked_in' ? 'angemeldet' : 'abgemeldet';
        const successMessage = `${studentName} erfolgreich ${action}`;

        setSuccess(successMessage);

        logUserAction('Attendance toggle completed successfully', {
          tagId: scannedTag,
          studentName,
          action: result.data.action,
          message: result.data.message,
        });
      } else {
        throw new Error(result.message ?? 'Anwesenheit konnte nicht geändert werden');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = error.message;
      logError(error, 'Attendance toggle failed');
      setError(`Fehler bei der Anwesenheitsänderung: ${errorMessage}`);
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Start a new scan
  const handleScanAnother = () => {
    logUserAction('Starting new attendance scan');
    clearStates();
    void handleStartScanning();
  };

  // Redirect to login if no authenticated user
  useEffect(() => {
    if (!authenticatedUser) {
      logNavigation('Attendance', '/');
      void navigate('/');
    }
  }, [authenticatedUser, navigate]);

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  // Determine the action text based on current status
  const getActionText = (): string => {
    if (!attendanceStatus?.data.attendance.status) return 'Anmelden';
    
    switch (attendanceStatus.data.attendance.status) {
      case 'not_checked_in':
      case 'checked_out':
        return 'Anmelden';
      case 'checked_in':
        return 'Abmelden';
      default:
        return 'Anmelden';
    }
  };

  // Get status display text and color
  const getStatusDisplay = () => {
    if (!attendanceStatus?.data.attendance.status) {
      return { text: 'Nicht angemeldet', color: theme.colors.text.secondary };
    }

    switch (attendanceStatus.data.attendance.status) {
      case 'not_checked_in':
        return { text: 'Nicht angemeldet', color: theme.colors.text.secondary };
      case 'checked_in':
        return { text: 'Angemeldet', color: theme.colors.success };
      case 'checked_out':
        return { text: 'Abgemeldet', color: theme.colors.text.secondary };
      default:
        return { text: 'Unbekannt', color: theme.colors.text.secondary };
    }
  };

  return (
    <>
      <ContentBox centered shadow="md" rounded="lg">
      <div style={{ width: '100%', maxWidth: '800px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Fixed Header */}
        <div style={{ flexShrink: 0 }}>
          {/* Navigation buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
              marginBottom: theme.spacing.lg,
            }}
          >
            <BackButton onClick={handleBack} />
          </div>
          
          {/* Title - Only show when no tag is scanned */}
          {!scannedTag && (
            <div style={{ textAlign: 'center', marginBottom: theme.spacing.xxl }}>
            <h1
              style={{
                fontSize: theme.fonts.size.xxl,
                fontWeight: theme.fonts.weight.bold,
                marginBottom: theme.spacing.lg,
                color: theme.colors.text.primary,
              }}
            >
              Anwesenheit
            </h1>
            </div>
          )}
        </div>

        {/* Scanner Modal Overlay */}
        {showScanner && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: theme.colors.background.light,
                borderRadius: theme.borders.radius.lg,
                padding: theme.spacing.xxl,
                textAlign: 'center',
                minWidth: '300px',
              }}
            >
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>📡</div>
              <h2
                style={{
                  fontSize: theme.fonts.size.xl,
                  fontWeight: theme.fonts.weight.bold,
                  marginBottom: theme.spacing.lg,
                  color: theme.colors.text.primary,
                }}
              >
                RFID Tag scannen...
              </h2>
              <p
                style={{
                  fontSize: theme.fonts.size.base,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.md,
                }}
              >
                {scannerStatus?.platform.includes('Development')
                  ? 'Simuliere Scan-Vorgang...'
                  : 'Halten Sie das Armband an den Scanner'}
              </p>
              <p
                style={{
                  fontSize: theme.fonts.size.small,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.xl,
                  fontStyle: 'italic',
                }}
              >
                Platform: {scannerStatus?.platform}
              </p>
              <Button onClick={() => setShowScanner(false)} variant="secondary">
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div style={{ padding: theme.spacing.lg }}>
          {/* Initial State - Start Scanning */}
          {!scannedTag && !isLoading && (
            <div style={{ textAlign: 'center' }}>
              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.lg,
                }}
              >
                Klicken Sie auf "Scannen", um die Anwesenheit zu verwalten
              </p>

              {/* Scanner Status Display - Only show in mock mode */}
              {scannerStatus && import.meta.env.VITE_ENABLE_RFID !== 'true' && (
                <div
                  style={{
                    backgroundColor: theme.colors.background.muted,
                    borderRadius: theme.borders.radius.md,
                    padding: theme.spacing.md,
                    marginBottom: theme.spacing.xl,
                    fontSize: theme.fonts.size.small,
                    color: theme.colors.text.secondary,
                  }}
                >
                  <p style={{ margin: 0, marginBottom: theme.spacing.xs }}>
                    <strong>Scanner:</strong> {scannerStatus.platform}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: theme.spacing.xs,
                      color: scannerStatus.is_available ? theme.colors.success : theme.colors.error,
                    }}
                  >
                    Status: {scannerStatus.is_available ? 'Verfügbar' : 'Nicht verfügbar'}
                  </p>
                  <p style={{ margin: 0, fontSize: theme.fonts.size.small, fontStyle: 'italic' }}>
                    Mode: Mock Development
                  </p>
                  {scannerStatus.last_error && (
                    <p
                      style={{ margin: 0, marginTop: theme.spacing.xs, color: theme.colors.error }}
                    >
                      {scannerStatus.last_error}
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={handleStartScanning}
                disabled={isLoading || (!scannerStatus?.is_available && isTauriContext())}
                style={{ marginBottom: theme.spacing.lg }}
              >
                {scannerStatus?.platform.includes('Development')
                  ? 'Mock Scannen'
                  : 'Scannen starten'}
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>⏳</div>
              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                }}
              >
                Verarbeite...
              </p>
            </div>
          )}

          {/* Tag Scanned - Show Student Status */}
          {scannedTag && attendanceStatus && !isLoading && !success && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
                <h1
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: theme.fonts.weight.bold,
                    marginBottom: theme.spacing.lg,
                    color: theme.colors.text.primary,
                  }}
                >
                  Anwesenheit
                </h1>

                {/* Student Info */}
                <div
                  style={{
                    backgroundColor: theme.colors.background.muted,
                    borderRadius: theme.borders.radius.md,
                    padding: theme.spacing.lg,
                    marginBottom: theme.spacing.xl,
                  }}
                >
                  <p style={{ fontSize: theme.fonts.size.base, marginBottom: theme.spacing.sm }}>
                    <strong>Schüler:</strong> {attendanceStatus.data.student.first_name} {attendanceStatus.data.student.last_name}
                  </p>
                  <p style={{ fontSize: theme.fonts.size.base, marginBottom: theme.spacing.sm }}>
                    <strong>Gruppe:</strong> {attendanceStatus.data.student.group.name}
                  </p>
                  <p
                    style={{
                      fontSize: theme.fonts.size.large,
                      fontWeight: theme.fonts.weight.bold,
                      color: getStatusDisplay().color,
                      marginBottom: theme.spacing.sm,
                    }}
                  >
                    Status: {getStatusDisplay().text}
                  </p>

                  {/* Show time details if available */}
                  {attendanceStatus.data.attendance.check_in_time && (
                    <div style={{ marginTop: theme.spacing.md, fontSize: theme.fonts.size.small }}>
                      <p style={{ margin: 0, marginBottom: theme.spacing.xs }}>
                        <strong>Angemeldet:</strong> {new Date(attendanceStatus.data.attendance.check_in_time).toLocaleTimeString('de-DE')}
                        {attendanceStatus.data.attendance.checked_in_by && ` von ${attendanceStatus.data.attendance.checked_in_by}`}
                      </p>
                      {attendanceStatus.data.attendance.check_out_time && (
                        <p style={{ margin: 0 }}>
                          <strong>Abgemeldet:</strong> {new Date(attendanceStatus.data.attendance.check_out_time).toLocaleTimeString('de-DE')}
                          {attendanceStatus.data.attendance.checked_out_by && ` von ${attendanceStatus.data.attendance.checked_out_by}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: theme.spacing.md,
                  justifyContent: 'center',
                }}
              >
                <Button onClick={handleToggleAttendance} disabled={isLoading} size="medium">
                  {getActionText()}
                </Button>
                <Button onClick={handleScanAnother} variant="secondary" size="medium">
                  Neuer Scan
                </Button>
              </div>
            </div>
          )}

          {/* Success State */}
          {success && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>✅</div>
              <h2
                style={{
                  fontSize: theme.fonts.size.xl,
                  fontWeight: theme.fonts.weight.bold,
                  marginBottom: theme.spacing.lg,
                  color: theme.colors.success,
                }}
              >
                Erfolgreich!
              </h2>
              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.xxl,
                }}
              >
                {success}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: theme.spacing.md,
                  justifyContent: 'center',
                }}
              >
                <Button onClick={handleScanAnother}>Weiteren Schüler scannen</Button>
                <Button onClick={handleBack} variant="secondary">
                  Zurück
                </Button>
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

export default AttendancePage;