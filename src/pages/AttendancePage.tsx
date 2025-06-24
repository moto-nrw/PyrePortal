import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
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
      <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
        <div style={{ 
          width: '100%', 
          height: '100%',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Modern back button - positioned absolutely like TagAssignmentPage */}
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
                transition: 'all 200ms',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                position: 'relative',
                overflow: 'hidden',
                backdropFilter: 'blur(8px)',
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)';
                e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
              }}
              onTouchEnd={(e) => {
                setTimeout(() => {
                  if (e.currentTarget) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                  }
                }, 150);
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
                <path d="M19 12H5"/>
                <path d="M12 19l-7-7 7-7"/>
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

          {/* Title - Dynamic based on state */}
          <h1
            style={{
              fontSize: '36px',
              fontWeight: theme.fonts.weight.bold,
              marginBottom: '48px',
              textAlign: 'center',
              color: theme.colors.text.primary,
            }}
          >
            {scannedTag && !success ? 'Anwesenheit verwalten' : 'Anwesenheit scannen'}
          </h1>

          {/* Scanner Modal Overlay - matching TagAssignmentPage style */}
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
                  transform: 'scale(1)',
                  animation: 'modalPop 0.3s ease-out',
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
                    background: 'radial-gradient(circle at top right, rgba(255,255,255,0.2) 0%, transparent 50%)',
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
                    animation: 'pulse 2s infinite',
                  }}
                >
                  <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {/* Standard NFC/Contactless payment symbol */}
                    <path d="M2 12h3.5" />
                    <path d="M5.5 6a6 6 0 0 1 0 12" />
                    <path d="M8.5 3a9 9 0 0 1 0 18" />
                    <path d="M11.5 0.5a11.5 11.5 0 0 1 0 23" />
                  </svg>
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
                    transition: 'all 200ms',
                    outline: 'none',
                    position: 'relative',
                    zIndex: 2,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Main Content - Centered */}
          <div style={{ 
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
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
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#5080D8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {/* Standard NFC/Contactless payment symbol */}
                    <path d="M2 12h3.5" />
                    <path d="M5.5 6a6 6 0 0 1 0 12" />
                    <path d="M8.5 3a9 9 0 0 1 0 18" />
                    <path d="M11.5 0.5a11.5 11.5 0 0 1 0 23" />
                  </svg>
                </div>
                
                <p
                  style={{
                    fontSize: '24px',
                    color: theme.colors.text.secondary,
                    marginBottom: '40px',
                    lineHeight: '1.4',
                  }}
                >
                  Klicken Sie auf "Scannen", um die<br />Anwesenheit zu prüfen
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
                    transition: 'all 200ms',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: '0 6px 20px rgba(80, 128, 216, 0.3)',
                    opacity: (isLoading || (!scannerStatus?.is_available && isTauriContext())) ? 0.5 : 1,
                  }}
                  onTouchStart={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.transform = 'scale(0.95)';
                      e.currentTarget.style.boxShadow = '0 3px 10px rgba(80, 128, 216, 0.4)';
                    }
                  }}
                  onTouchEnd={(e) => {
                    setTimeout(() => {
                      if (e.currentTarget && !e.currentTarget.disabled) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(80, 128, 216, 0.3)';
                      }
                    }, 150);
                  }}
                >
                  {scannerStatus?.platform.includes('Development')
                    ? 'Mock Scannen'
                    : 'Scannen starten'}
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !showScanner && (
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    border: '4px solid #E5E7EB',
                    borderTopColor: '#5080D8',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
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

            {/* Tag Scanned - Show Student Status */}
            {scannedTag && attendanceStatus && !isLoading && !success && (
              <div style={{ width: '100%', maxWidth: '600px' }}>
                {/* Student Status Card */}
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
                    <h2 style={{ 
                      fontSize: '24px', 
                      fontWeight: 700,
                      marginBottom: '16px',
                      color: '#1F2937'
                    }}>
                      {attendanceStatus.data.student.first_name} {attendanceStatus.data.student.last_name}
                    </h2>
                    <p style={{ 
                      fontSize: '18px', 
                      color: '#6B7280',
                      marginBottom: '24px'
                    }}>
                      {attendanceStatus.data.student.group.name}
                    </p>
                    
                    {/* Status Badge */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        backgroundColor: getStatusDisplay().color === theme.colors.success 
                          ? '#E7F7DF' 
                          : '#F3F4F6',
                        borderRadius: '24px',
                        marginBottom: attendanceStatus.data.attendance.check_in_time ? '20px' : '0',
                      }}
                    >
                      {getStatusDisplay().color === theme.colors.success ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#83cd2d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="15" y1="9" x2="9" y2="15"/>
                          <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                      )}
                      <span style={{ 
                        fontSize: '18px', 
                        fontWeight: 600, 
                        color: getStatusDisplay().color 
                      }}>
                        {getStatusDisplay().text}
                      </span>
                    </div>

                    {/* Time details */}
                    {attendanceStatus.data.attendance.check_in_time && (
                      <div style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.6 }}>
                        <p style={{ margin: 0, marginBottom: '4px' }}>
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
                    gap: '16px',
                    justifyContent: 'center',
                  }}
                >
                  <button
                    onClick={handleToggleAttendance}
                    disabled={isLoading}
                    style={{
                      flex: 1,
                      height: '56px',
                      fontSize: '18px',
                      fontWeight: 600,
                      backgroundColor: getActionText() === 'Anmelden' ? '#83cd2d' : '#f87C10',
                      color: 'white',
                      border: 'none',
                      borderRadius: '28px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 200ms',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: getActionText() === 'Anmelden' 
                        ? '0 4px 16px rgba(131, 205, 45, 0.3)'
                        : '0 4px 16px rgba(248, 124, 16, 0.3)',
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    onTouchStart={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.transform = 'scale(0.95)';
                      }
                    }}
                    onTouchEnd={(e) => {
                      setTimeout(() => {
                        if (e.currentTarget && !e.currentTarget.disabled) {
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }, 150);
                    }}
                  >
                    {getActionText()}
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
                      transition: 'all 200ms',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.transform = 'scale(0.95)';
                      e.currentTarget.style.backgroundColor = '#F9FAFB';
                    }}
                    onTouchEnd={(e) => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }, 150);
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
                    animation: 'successPop 0.5s ease-out',
                  }}
                >
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#83cd2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
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
                      transition: 'all 200ms',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: '0 4px 16px rgba(80, 128, 216, 0.3)',
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.transform = 'scale(0.95)';
                    }}
                    onTouchEnd={(e) => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }, 150);
                    }}
                  >
                    Weiteren Schüler scannen
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
                      transition: 'all 200ms',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.transform = 'scale(0.95)';
                      e.currentTarget.style.backgroundColor = '#F9FAFB';
                    }}
                    onTouchEnd={(e) => {
                      setTimeout(() => {
                        if (e.currentTarget) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }, 150);
                    }}
                  >
                    Zurück
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Add animation keyframes */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            
            @keyframes modalPop {
              0% {
                transform: scale(0.8);
                opacity: 0;
              }
              50% {
                transform: scale(1.05);
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
            
            @keyframes pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
              }
              70% {
                box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
              }
            }
            
            @keyframes successPop {
              0% {
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.2);
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
          `}
        </style>
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