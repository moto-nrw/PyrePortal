import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal } from '../components/ui';
import { api, type Student, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logUserAction } from '../utils/logger';

const ENTITIES_PER_PAGE = 10; // 5x2 grid to use full width

// Union type for assignable entities (students and teachers)
type AssignableEntity = { type: 'student'; data: Student } | { type: 'teacher'; data: Teacher };

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

  const [entities, setEntities] = useState<AssignableEntity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null); // Format: "student-{id}" or "teacher-{id}"
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null); // null = all, 'betreuer' = staff only, or class name

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

  // Fetch students and teachers
  useEffect(() => {
    const fetchEntities = async () => {
      if (!authenticatedUser?.pin) return;

      try {
        setIsLoading(true);
        logger.debug('Fetching students and teachers', {
          supervisorCount: selectedSupervisors.length,
          authenticatedUserId: authenticatedUser.staffId,
        });

        // If no supervisors selected, use authenticated user's ID
        const teacherIds =
          selectedSupervisors.length > 0
            ? selectedSupervisors.map(supervisor => supervisor.id)
            : [authenticatedUser.staffId];

        // Fetch both students and teachers in parallel
        const [studentList, teacherList] = await Promise.all([
          api.getStudents(authenticatedUser.pin, teacherIds),
          api.getTeachers(),
        ]);

        // Combine into unified entity list
        const combinedEntities: AssignableEntity[] = [
          ...studentList.map(s => ({ type: 'student' as const, data: s })),
          ...teacherList.map(t => ({ type: 'teacher' as const, data: t })),
        ];

        setEntities(combinedEntities);
        logger.info('Entities fetched successfully', {
          students: studentList.length,
          teachers: teacherList.length,
          total: combinedEntities.length,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to fetch entities', {
          error: error.message,
          stack: error.stack,
        });
        setError(`Fehler beim Laden: ${error.message}`);
        setShowErrorModal(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (authenticatedUser) {
      void fetchEntities();
    }
  }, [authenticatedUser, selectedSupervisors, logger]);

  // Distinct classes from students for quick class filter
  const availableClasses = useMemo(() => {
    const classSet = new Set<string>();
    entities.forEach(e => {
      if (e.type === 'student' && e.data.school_class) classSet.add(e.data.school_class);
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b, 'de'));
  }, [entities]);

  // Apply filter by type or class
  const filteredEntities = useMemo(() => {
    const filtered = entities.filter(e => {
      if (!selectedFilter) return true;
      if (selectedFilter === 'betreuer') return e.type === 'teacher';
      // Class filter - only students
      if (e.type !== 'student') return false;
      return (e.data.school_class ?? '') === selectedFilter;
    });

    return filtered.sort((a, b) => {
      const an =
        a.type === 'student' ? `${a.data.last_name} ${a.data.first_name}` : a.data.display_name;
      const bn =
        b.type === 'student' ? `${b.data.last_name} ${b.data.first_name}` : b.data.display_name;
      return an.localeCompare(bn, 'de');
    });
  }, [entities, selectedFilter]);

  // Calculate pagination on filtered list
  // Fallback to 1 to avoid 0 pages when list is empty
  const totalPages = Math.ceil(filteredEntities.length / ENTITIES_PER_PAGE) || 1;
  const paginatedEntities = useMemo(() => {
    const start = currentPage * ENTITIES_PER_PAGE;
    const end = start + ENTITIES_PER_PAGE;
    return filteredEntities.slice(start, end);
  }, [filteredEntities, currentPage]);

  // Calculate empty slots to maintain grid layout
  const emptySlots = useMemo(() => {
    const entitiesOnPage = paginatedEntities.length;
    if (entitiesOnPage < ENTITIES_PER_PAGE) {
      return ENTITIES_PER_PAGE - entitiesOnPage;
    }
    return 0;
  }, [paginatedEntities]);

  // Reset pagination and selection when filter changes
  useEffect(() => {
    setCurrentPage(0);
    setSelectedEntityId(null);
  }, [selectedFilter]);

  const handleEntitySelect = (entity: AssignableEntity) => {
    const entityId =
      entity.type === 'student'
        ? `student-${entity.data.student_id}`
        : `teacher-${entity.data.staff_id}`;

    const entityName =
      entity.type === 'student'
        ? `${entity.data.first_name} ${entity.data.last_name}`
        : entity.data.display_name;

    logger.info('Entity selected', {
      type: entity.type,
      name: entityName,
      id: entityId,
    });

    setSelectedEntityId(entityId);

    logUserAction('entity_selection', {
      type: entity.type,
      name: entityName,
      tagId: state.scannedTag,
    });
  };

  const handleAssignTag = async () => {
    if (!selectedEntityId || !authenticatedUser?.pin || !state?.scannedTag) {
      logger.warn('Invalid assignment attempt');
      setError('Bitte wählen Sie eine Person aus.');
      setShowErrorModal(true);
      return;
    }

    setIsSaving(true);

    // Find selected entity
    const selectedEntity = entities.find(e => {
      const id =
        e.type === 'student' ? `student-${e.data.student_id}` : `teacher-${e.data.staff_id}`;
      return id === selectedEntityId;
    });

    if (!selectedEntity) {
      setError('Ungültige Auswahl');
      setShowErrorModal(true);
      setIsSaving(false);
      return;
    }

    try {
      const entityName =
        selectedEntity.type === 'student'
          ? `${selectedEntity.data.first_name} ${selectedEntity.data.last_name}`
          : selectedEntity.data.display_name;

      logger.info('Assigning tag to entity', {
        type: selectedEntity.type,
        tagId: state.scannedTag,
        entityName,
      });

      // Route to correct endpoint based on entity type
      const result =
        selectedEntity.type === 'teacher'
          ? await api.assignStaffTag(
              authenticatedUser.pin,
              selectedEntity.data.staff_id,
              state.scannedTag
            )
          : await api.assignTag(
              authenticatedUser.pin,
              selectedEntity.data.student_id,
              state.scannedTag
            );

      if (result.success) {
        logUserAction('tag_assignment_complete', {
          type: selectedEntity.type,
          tagId: state.scannedTag,
          entityName,
        });

        // Navigate back with success message
        void navigate('/tag-assignment', {
          state: {
            assignmentSuccess: true,
            studentName: entityName,
            previousTag: result.previous_tag,
            scannedTag: state.scannedTag,
            tagAssignment: state.tagAssignment,
          },
        });
      } else {
        throw new Error(result.message ?? 'Armband-Zuweisung fehlgeschlagen');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to assign tag', { error });
      setError('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.');
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    logger.info('User navigating back to tag assignment');
    logUserAction('student_selection_back');
    // Pass back the scan state so TagAssignmentPage shows the scan result
    void navigate('/tag-assignment', {
      state: {
        scannedTag: state.scannedTag,
        tagAssignment: state.tagAssignment,
      },
    });
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
            fontSize: '56px',
            fontWeight: 700,
            marginTop: '40px',
            marginBottom: '20px',
            textAlign: 'center',
            color: '#111827',
          }}
        >
          Person auswählen
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

        {/* Filter (chips wrap, no scrolling) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <div style={{ color: '#6B7280', fontSize: '14px', fontWeight: 600 }}>Filter:</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px',
              maxWidth: '100%',
            }}
          >
            <button
              onClick={() => setSelectedFilter(null)}
              style={{
                height: '40px',
                padding: '0 14px',
                borderRadius: designSystem.borderRadius.full,
                border: selectedFilter === null ? 'none' : '1px solid #E5E7EB',
                background: selectedFilter === null ? designSystem.gradients.blueRight : '#FFFFFF',
                color: selectedFilter === null ? '#FFFFFF' : '#374151',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: selectedFilter === null ? designSystem.shadows.blue : 'none',
              }}
            >
              Alle
            </button>
            <button
              onClick={() => setSelectedFilter('betreuer')}
              style={{
                height: '40px',
                padding: '0 14px',
                borderRadius: designSystem.borderRadius.full,
                border: selectedFilter === 'betreuer' ? 'none' : '1px solid #E5E7EB',
                background:
                  selectedFilter === 'betreuer' ? designSystem.gradients.blueRight : '#FFFFFF',
                color: selectedFilter === 'betreuer' ? '#FFFFFF' : '#374151',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: selectedFilter === 'betreuer' ? designSystem.shadows.blue : 'none',
              }}
            >
              Betreuer
            </button>
            {availableClasses.map(cls => {
              const active = selectedFilter === cls;
              return (
                <button
                  key={cls}
                  onClick={() => setSelectedFilter(cls)}
                  style={{
                    height: '40px',
                    padding: '0 14px',
                    borderRadius: designSystem.borderRadius.full,
                    border: active ? 'none' : '1px solid #E5E7EB',
                    background: active ? designSystem.gradients.blueRight : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#374151',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {cls}
                </button>
              );
            })}
          </div>
        </div>

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
            <p style={{ color: '#6B7280', fontSize: '16px' }}>Lade Personen...</p>
          </div>
        ) : entities.length === 0 ? (
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
              Keine Personen gefunden
            </p>
            <p style={{ fontSize: '16px' }}>Es sind keine Schüler oder Betreuer verfügbar.</p>
          </div>
        ) : (
          <>
            {/* Entity Grid (Students + Teachers) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '14px',
                marginTop: '24px',
                marginBottom: '0px',
                alignContent: 'start',
              }}
            >
              {paginatedEntities.map(entity => {
                const entityId =
                  entity.type === 'student'
                    ? `student-${entity.data.student_id}`
                    : `teacher-${entity.data.staff_id}`;
                const isSelected = selectedEntityId === entityId;

                return (
                  <button
                    key={entityId}
                    onClick={() => handleEntitySelect(entity)}
                    onTouchStart={e => {
                      e.currentTarget.style.transform = 'scale(0.98)';
                    }}
                    onTouchEnd={e => {
                      setTimeout(() => {
                        if (e.currentTarget) e.currentTarget.style.transform = 'scale(1)';
                      }, 50);
                    }}
                    style={{
                      width: '100%',
                      height: '160px',
                      backgroundColor: '#FFFFFF',
                      border: isSelected ? '3px solid #83CD2D' : '2px solid #E5E7EB',
                      borderRadius: '24px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      position: 'relative',
                      transition: 'all 150ms ease-out',
                      boxShadow: isSelected
                        ? '0 8px 30px rgba(131, 205, 45, 0.2)'
                        : '0 4px 12px rgba(0, 0, 0, 0.08)',
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
                        width: '64px',
                        height: '64px',
                        backgroundColor: isSelected ? 'rgba(131,205,45,0.15)' : '#DBEAFE',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? designSystem.colors.primaryGreen : '#2563EB',
                      }}
                    >
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>

                    {/* Entity Name */}
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        lineHeight: '1.2',
                        textAlign: 'center',
                        color: '#111827',
                      }}
                    >
                      {entity.type === 'student'
                        ? `${entity.data.first_name} ${entity.data.last_name}`
                        : entity.data.display_name}
                    </span>

                    {/* Role Badge or Class */}
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        backgroundColor: entity.type === 'teacher' ? '#3B82F6' : '#83cd2d',
                        color: 'white',
                        fontWeight: 600,
                      }}
                    >
                      {entity.type === 'teacher'
                        ? 'Betreuer'
                        : (entity.data.school_class ?? 'Schüler')}
                    </span>
                  </button>
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
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  marginTop: '12px',
                  width: '100%',
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
                    justifySelf: 'start',
                  }}
                >
                  ← Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                    justifySelf: 'center',
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
                    justifySelf: 'end',
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
                marginTop: '12px',
              }}
            >
              <button
                onClick={handleAssignTag}
                disabled={!selectedEntityId || isSaving}
                style={{
                  height: '64px',
                  padding: '0 64px',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  background:
                    !selectedEntityId || isSaving
                      ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                      : designSystem.gradients.greenRight,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: !selectedEntityId || isSaving ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: !selectedEntityId || isSaving ? 'none' : designSystem.shadows.green,
                  opacity: !selectedEntityId || isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Zuweisen...' : 'Armband zuweisen'}
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
    </BackgroundWrapper>
  );
}

export default StudentSelectionPage;
