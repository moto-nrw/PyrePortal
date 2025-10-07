import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { ContentBox, ErrorModal } from '../components/ui';
import { api, type Student } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logUserAction } from '../utils/logger';

const STUDENTS_PER_PAGE = 10; // 5x2 grid to use full width

interface LocationState {
  scannedTag: string;
  tagAssignment: {
    assigned: boolean;
    student?: {
      name: string;
      group: string;
    };
  };
}

function StudentSelectionPage() {
  const { authenticatedUser, selectedSupervisors } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const logger = useMemo(() => createLogger('StudentSelectionPage'), []);

  // Redirect if not authenticated or no tag data
  useEffect(() => {
    if (!authenticatedUser || !state?.scannedTag) {
      logger.warn('Invalid access to StudentSelectionPage');
      void navigate('/tag-assignment');
      return;
    }

    logger.debug('StudentSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      scannedTag: state.scannedTag,
    });
  }, [authenticatedUser, state, navigate, logger]);

  // Fetch students
  useEffect(() => {
    const fetchStudents = async () => {
      if (!authenticatedUser?.pin) return;

      try {
        setIsLoading(true);
        logger.debug('Fetching students', {
          supervisorCount: selectedSupervisors.length,
          supervisors: selectedSupervisors,
          authenticatedUserId: authenticatedUser.staffId,
          authenticatedUserName: authenticatedUser.staffName
        });

        // If no supervisors selected, use authenticated user's ID
        const teacherIds = selectedSupervisors.length > 0
          ? selectedSupervisors.map(supervisor => supervisor.id)
          : [authenticatedUser.staffId];

        logger.debug('Teacher IDs for student fetch', { teacherIds });

        const studentList = await api.getStudents(authenticatedUser.pin, teacherIds);
        logger.debug('API Response - Students', { count: studentList.length, studentList });
        setStudents(studentList);
        logger.info('Students fetched successfully', { count: studentList.length });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to fetch students', {
          error: error.message,
          stack: error.stack
        });
        setError(`Fehler beim Laden der Schüler: ${error.message}`);
        setShowErrorModal(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (authenticatedUser) {
      void fetchStudents();
    }
  }, [authenticatedUser, selectedSupervisors, logger]);

  // Calculate pagination
  const totalPages = Math.ceil(students.length / STUDENTS_PER_PAGE);
  const paginatedStudents = useMemo(() => {
    const start = currentPage * STUDENTS_PER_PAGE;
    const end = start + STUDENTS_PER_PAGE;
    return students.slice(start, end);
  }, [students, currentPage]);

  // Calculate empty slots to maintain grid layout
  const emptySlots = useMemo(() => {
    const studentsOnPage = paginatedStudents.length;
    if (studentsOnPage < STUDENTS_PER_PAGE) {
      return STUDENTS_PER_PAGE - studentsOnPage;
    }
    return 0;
  }, [paginatedStudents]);

  const handleStudentSelect = (student: Student) => {
    logger.info('Student selected', {
      studentName: `${student.first_name} ${student.last_name}`,
      studentId: student.student_id,
    });

    setSelectedStudentId(student.student_id);

    logUserAction('student_selection', {
      studentName: `${student.first_name} ${student.last_name}`,
      studentId: student.student_id,
      tagId: state.scannedTag,
    });
  };

  const handleAssignTag = async () => {
    if (!selectedStudentId || !authenticatedUser?.pin || !state?.scannedTag) {
      logger.warn('Invalid assignment attempt');
      setError('Bitte wählen Sie einen Schüler aus.');
      setShowErrorModal(true);
      return;
    }

    setIsSaving(true);
    const selectedStudent = students.find(s => s.student_id === selectedStudentId);

    try {
      logger.info('Assigning tag to student', {
        tagId: state.scannedTag,
        studentId: selectedStudentId,
      });

      const result = await api.assignTag(authenticatedUser.pin, selectedStudentId, state.scannedTag);

      if (result.success) {
        logUserAction('tag_assignment_complete', {
          tagId: state.scannedTag,
          studentId: selectedStudentId,
          studentName: selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : 'Unknown',
        });

        // Navigate back with success message and tag data
        void navigate('/tag-assignment', {
          state: {
            assignmentSuccess: true,
            studentName: selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : 'Unknown',
            previousTag: result.previous_tag,
            scannedTag: state.scannedTag,
            tagAssignment: state.tagAssignment,
          },
        });
      } else {
        throw new Error(result.message ?? 'Tag-Zuweisung fehlgeschlagen');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to assign tag', { error });
      setError(`Fehler bei der Tag-Zuweisung: ${error.message}`);
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    logger.info('User navigating back to tag assignment');
    logUserAction('student_selection_back');
    void navigate('/tag-assignment');
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  if (!authenticatedUser || !state?.scannedTag) {
    return null;
  }

  return (
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
        {/* Back button */}
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
              ...designSystem.components.backButton,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
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

        <h1
          style={{
            fontSize: '36px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: '48px',
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          Schüler auswählen
        </h1>

        {/* Error display */}
        {error && !showErrorModal && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '3px solid #E5E7EB',
                borderTopColor: '#5080D8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ color: '#6B7280', fontSize: '16px' }}>
              Lade Schüler...
            </p>
          </div>
        ) : students.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6B7280',
            }}
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: '0 auto 16px' }}
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
              Keine Schüler gefunden
            </p>
            <p style={{ fontSize: '16px' }}>
              Es sind keine Schüler für die ausgewählten Betreuer verfügbar.
            </p>
          </div>
        ) : (
          <>
            {/* Student Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '14px',
                marginBottom: '24px',
                flex: 1,
                alignContent: 'start',
              }}
            >
              {paginatedStudents.map(student => {
                const isSelected = selectedStudentId === student.student_id;
                return (
                  <div
                    key={student.student_id}
                    style={{
                      background: isSelected
                        ? designSystem.gradients.green
                        : designSystem.gradients.blue,
                      borderRadius: designSystem.borderRadius.xl,
                      padding: '3px',
                      cursor: 'pointer',
                      boxShadow: isSelected
                        ? designSystem.shadows.green
                        : designSystem.shadows.blue,
                    }}
                  >
                    <button
                      onClick={() => handleStudentSelect(student)}
                      style={{
                        width: '100%',
                        height: '160px',
                        backgroundColor: '#FFFFFF',
                        border: 'none',
                        borderRadius: `calc(${designSystem.borderRadius.xl} - 3px)`,
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        background: designSystem.gradients.light,
                        backdropFilter: designSystem.glass.blur,
                        WebkitBackdropFilter: designSystem.glass.blur,
                        position: 'relative',
                        padding: '12px',
                      }}
                    >
                      {/* Selection indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: isSelected ? designSystem.colors.primaryGreen : '#E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>

                      {/* Student Icon */}
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          background: isSelected
                            ? designSystem.gradients.green
                            : designSystem.gradients.blue,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isSelected
                            ? designSystem.shadows.green
                            : designSystem.shadows.blue,
                        }}
                      >
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>

                      {/* Student Name */}
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          lineHeight: '1.2',
                          textAlign: 'center',
                          color: '#1F2937',
                        }}
                      >
                        {student.first_name} {student.last_name}
                      </span>

                      {/* Class */}
                      <span
                        style={{
                          fontSize: '14px',
                          color: '#6B7280',
                          fontWeight: 500,
                        }}
                      >
                        {student.school_class ?? 'N/A'}
                      </span>
                    </button>
                  </div>
                );
              })}

              {/* Empty placeholder slots */}
              {emptySlots > 0 &&
                Array.from({ length: emptySlots }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    style={{
                      height: '160px',
                      backgroundColor: '#FAFAFA',
                      border: '2px dashed #E5E7EB',
                      borderRadius: '20px',
                    }}
                  />
                ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '12px',
                }}
              >
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  style={{
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === 0 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 0 ? 0.5 : 1,
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  ← Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  Seite {currentPage + 1} von {totalPages}
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages - 1}
                  style={{
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === totalPages - 1 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages - 1 ? 0.5 : 1,
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Nächste →
                </button>
              </div>
            )}

            {/* Assign button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: '24px',
              }}
            >
              <button
                onClick={handleAssignTag}
                disabled={!selectedStudentId || isSaving}
                style={{
                  height: '56px',
                  padding: '0 48px',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background:
                    !selectedStudentId || isSaving
                      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                      : designSystem.gradients.greenRight,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: !selectedStudentId || isSaving ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow:
                    !selectedStudentId || isSaving
                      ? 'none'
                      : designSystem.shadows.green,
                  opacity: !selectedStudentId || isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Zuweisen...' : 'Tag zuweisen'}
              </button>
            </div>
          </>
        )}

        {/* Error Modal */}
        <ErrorModal
          isOpen={showErrorModal}
          onClose={() => setShowErrorModal(false)}
          message={error ?? ''}
          autoCloseDelay={3000}
        />

        {/* Add animation keyframes */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </ContentBox>
  );
}

export default StudentSelectionPage;
