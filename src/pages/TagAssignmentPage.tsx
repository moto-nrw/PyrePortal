import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { api, type Student, type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { logNavigation, logUserAction, logError } from '../utils/logger';
import { safeInvoke, isTauriContext, isRfidEnabled } from '../utils/tauriContext';

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

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedTag, setScannedTag] = useState<string | null>(null);
  const [tagAssignment, setTagAssignment] = useState<TagAssignmentCheck | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<RfidScannerStatus | null>(null);

  const clearStates = useCallback(() => {
    setScannedTag(null);
    setTagAssignment(null);
    setSelectedStudentId(null);
    setError(null);
    setSuccess(null);
  }, []);

  // Handle back navigation
  const handleBack = () => {
    logNavigation('Tag Assignment', '/home');
    void navigate('/home');
  };

  // Check RFID scanner status on component mount
  useEffect(() => {
    const checkScannerStatus = async () => {
      console.log('Checking RFID scanner status...');
      
      if (!isTauriContext()) {
        console.log('Not in Tauri context, using development status');
        setScannerStatus({
          is_available: false,
          platform: 'Development (Web)',
          last_error: 'Tauri context not available in development mode',
        });
        return;
      }
      
      try {
        console.log('Calling get_rfid_scanner_status...');
        const status = await safeInvoke<RfidScannerStatus>('get_rfid_scanner_status');
        console.log('Scanner status received:', status);
        setScannerStatus(status);
        logUserAction('RFID scanner status checked', { platform: status.platform, available: status.is_available });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.log('Scanner status error:', error);
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
          const mockTagId = `DEV_TAG_${Date.now().toString().slice(-6)}`;
          logUserAction('Mock RFID tag scanned', { tagId: mockTagId, platform: 'Development' });
          void handleTagScanned(mockTagId);
        }, 2000);
        return;
      }

      // Use real RFID scanner through Tauri
      const result = await safeInvoke<RfidScanResult>('scan_rfid_single');
      
      if (result.success && result.tag_id) {
        logUserAction('RFID tag scanned successfully', { tagId: result.tag_id, platform: scannerStatus?.platform });
        void handleTagScanned(result.tag_id);
      } else {
        const errorMessage = result.error ?? 'Unknown scanning error';
        logError(new Error(errorMessage), 'RFID scanning failed');
        setError(`Scan-Fehler: ${errorMessage}`);
        setShowScanner(false);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'RFID scanner invocation failed');
      setError(`Scanner-Fehler: ${error.message}`);
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
      
      // Fetch teacher's students for assignment dropdown
      const teacherStudents = await fetchStudents();
      setStudents(teacherStudents);
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = error.message;
      logError(error, 'Failed to process scanned tag');
      setError(`Fehler beim Verarbeiten des Tags: ${errorMessage}`);
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

  // Fetch teacher's students
  const fetchStudents = async (): Promise<Student[]> => {
    if (!authenticatedUser?.pin) {
      throw new Error('Keine Authentifizierung verfügbar');
    }

    return await api.getStudents(authenticatedUser.pin);
  };

  // Assign tag to selected student
  const handleAssignTag = async () => {
    if (!scannedTag || !selectedStudentId || !authenticatedUser?.pin) {
      setError('Ungültige Auswahl. Bitte versuchen Sie es erneut.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selectedStudent = students.find(s => s.student_id === selectedStudentId);
      if (!selectedStudent) {
        throw new Error('Student nicht gefunden');
      }

      logUserAction('Tag assignment initiated', { 
        tagId: scannedTag, 
        studentId: selectedStudentId,
        studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`
      });

      // Call the actual API endpoint
      const result = await api.assignTag(authenticatedUser.pin, selectedStudentId, scannedTag);
      
      if (result.success) {
        const studentName = `${selectedStudent.first_name} ${selectedStudent.last_name}`;
        let successMessage = `Tag erfolgreich zugewiesen an ${studentName}`;
        
        if (result.previous_tag) {
          successMessage += ` (Vorheriger Tag: ${result.previous_tag})`;
        }
        
        setSuccess(successMessage);
        
        logUserAction('Tag assignment completed successfully', { 
          tagId: scannedTag, 
          studentName,
          previousTag: result.previous_tag
        });
      } else {
        throw new Error(result.message ?? 'Tag-Zuweisung fehlgeschlagen');
      }

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = error.message;
      logError(error, 'Tag assignment failed');
      setError(`Fehler bei der Tag-Zuweisung: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
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
    <ContentBox centered shadow="md" rounded="lg">
      <div style={{ width: '100%', maxWidth: '600px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: theme.spacing.xxl }}>
          <h1
            style={{
              fontSize: theme.fonts.size.xxl,
              fontWeight: theme.fonts.weight.bold,
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.primary,
            }}
          >
            Armband scannen
          </h1>
          <p
            style={{
              fontSize: theme.fonts.size.large,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {authenticatedUser.staffName}
          </p>
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
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>
                📱
              </div>
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
              <Button
                onClick={() => setShowScanner(false)}
                variant="secondary"
              >
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
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.xl }}>
                📱
              </div>
              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.lg,
                }}
              >
                Klicken Sie auf "Scannen", um ein RFID-Armband zu scannen
              </p>
              
              {/* Scanner Status Display */}
              {scannerStatus && (
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
                  <p style={{ margin: 0, marginBottom: theme.spacing.xs, color: scannerStatus.is_available ? theme.colors.success : theme.colors.error }}>
                    Status: {scannerStatus.is_available ? 'Verfügbar' : 'Nicht verfügbar'}
                  </p>
                  <p style={{ margin: 0, fontSize: theme.fonts.size.small, fontStyle: 'italic' }}>
                    Mode: {import.meta.env.VITE_ENABLE_RFID === 'true' ? 'Hardware RFID' : 'Mock Development'}
                  </p>
                  {scannerStatus.last_error && (
                    <p style={{ margin: 0, marginTop: theme.spacing.xs, color: theme.colors.error }}>
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
                {scannerStatus?.platform.includes('Development') ? 'Mock Scannen' : 'Scannen starten'}
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>
                ⏳
              </div>
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

          {/* Tag Scanned - Show Assignment Options */}
          {scannedTag && tagAssignment && !isLoading && !success && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
                <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>
                  📋
                </div>
                <h2
                  style={{
                    fontSize: theme.fonts.size.xl,
                    fontWeight: theme.fonts.weight.bold,
                    marginBottom: theme.spacing.lg,
                    color: theme.colors.text.primary,
                  }}
                >
                  Tag: {scannedTag}
                </h2>
                
                {/* Current Assignment Status */}
                {tagAssignment.assigned && tagAssignment.student ? (
                  <div
                    style={{
                      backgroundColor: theme.colors.background.muted,
                      borderRadius: theme.borders.radius.md,
                      padding: theme.spacing.lg,
                      marginBottom: theme.spacing.xl,
                    }}
                  >
                    <p style={{ fontSize: theme.fonts.size.base, marginBottom: theme.spacing.sm }}>
                      <strong>Aktuell zugewiesen an:</strong>
                    </p>
                    <p style={{ fontSize: theme.fonts.size.large, fontWeight: theme.fonts.weight.bold }}>
                      {tagAssignment.student.name}
                    </p>
                    <p style={{ fontSize: theme.fonts.size.base, color: theme.colors.text.secondary }}>
                      {tagAssignment.student.group}
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: theme.colors.background.muted,
                      borderRadius: theme.borders.radius.md,
                      padding: theme.spacing.lg,
                      marginBottom: theme.spacing.xl,
                    }}
                  >
                    <p style={{ fontSize: theme.fonts.size.large, color: theme.colors.text.secondary }}>
                      Tag ist nicht zugewiesen
                    </p>
                  </div>
                )}
              </div>

              {/* Student Selection */}
              <div style={{ marginBottom: theme.spacing.xl }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: theme.fonts.size.base,
                    fontWeight: theme.fonts.weight.bold,
                    marginBottom: theme.spacing.md,
                    color: theme.colors.text.primary,
                  }}
                >
                  {tagAssignment.assigned ? 'Neuen Schüler zuweisen:' : 'Schüler auswählen:'}
                </label>
                <select
                  value={selectedStudentId ?? ''}
                  onChange={(e) => setSelectedStudentId(Number(e.target.value) || null)}
                  style={{
                    width: '100%',
                    padding: theme.spacing.md,
                    fontSize: theme.fonts.size.base,
                    borderRadius: theme.borders.radius.md,
                    border: `1px solid ${theme.colors.border.light}`,
                    backgroundColor: theme.colors.background.light,
                  }}
                >
                  <option value="">Schüler auswählen...</option>
                  {students.map((student) => (
                    <option key={student.student_id} value={student.student_id}>
                      {student.first_name} {student.last_name} ({student.school_class ?? ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: theme.spacing.md,
                  justifyContent: 'center',
                }}
              >
                <Button
                  onClick={handleAssignTag}
                  disabled={!selectedStudentId || isLoading}
                >
                  {tagAssignment.assigned ? 'Neu zuweisen' : 'Zuweisen'}
                </Button>
                <Button
                  onClick={handleScanAnother}
                  variant="secondary"
                >
                  Neuer Scan
                </Button>
              </div>
            </div>
          )}

          {/* Success State */}
          {success && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>
                ✅
              </div>
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
                <Button
                  onClick={handleScanAnother}
                >
                  Weiteres Armband scannen
                </Button>
                <Button
                  onClick={handleBack}
                  variant="secondary"
                >
                  Zurück
                </Button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div
              style={{
                backgroundColor: theme.colors.error + '20',
                borderLeft: `4px solid ${theme.colors.error}`,
                padding: theme.spacing.lg,
                marginBottom: theme.spacing.xl,
              }}
            >
              <p
                style={{
                  color: theme.colors.error,
                  fontSize: theme.fonts.size.base,
                  margin: 0,
                }}
              >
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Back Button */}
        {!showScanner && (
          <div style={{ textAlign: 'center', marginTop: theme.spacing.xl }}>
            <Button
              onClick={handleBack}
              variant="secondary"
            >
              Zurück zur Startseite
            </Button>
          </div>
        )}
      </div>
    </ContentBox>
  );
}

export default TagAssignmentPage;