import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import { api, Student, TagAssignmentCheck } from '../services/api';
import theme from '../styles/theme';
import { logNavigation, logUserAction, logError } from '../utils/logger';


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

  // Start RFID scanning process
  const handleStartScanning = async () => {
    logUserAction('RFID scanning started');
    
    clearStates();
    setShowScanner(true);
    
    // Connection point for future RFID hardware integration
    // For now, simulate a scan after 2 seconds for UI testing
    setTimeout(() => {
      handleTagScanned('TEST-TAG-001'); // Mock tag for testing
    }, 2000);
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
        throw new Error(result.message || 'Tag-Zuweisung fehlgeschlagen');
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
                  marginBottom: theme.spacing.xl,
                }}
              >
                Halten Sie das Armband an den Scanner
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
                  marginBottom: theme.spacing.xxl,
                }}
              >
                Klicken Sie auf "Scannen", um ein RFID-Armband zu scannen
              </p>
              <Button
                onClick={handleStartScanning}
                disabled={isLoading}
                style={{ marginBottom: theme.spacing.lg }}
              >
                Scannen starten
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
                  value={selectedStudentId || ''}
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
                      {student.first_name} {student.last_name} ({student.school_class})
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