import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import {
  ErrorModal,
  ModalBase,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { usePagination } from '../hooks/usePagination';
import { api, type Student, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logUserAction, serializeError } from '../utils/logger';

const ENTITIES_PER_PAGE = 5; // 5x1 grid — filters are primary navigation

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
  const { authenticatedUser, selectedSupervisors, clearTagScan } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [entities, setEntities] = useState<AssignableEntity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null); // Format: "student-{id}" or "teacher-{id}"
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [showStaffOnly, setShowStaffOnly] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const logger = useMemo(() => createLogger('StudentSelectionPage'), []);

  // Redirect if not authenticated or no tag data
  useEffect(() => {
    if (!authenticatedUser || !state?.scannedTag) {
      logger.warn('Invalid access to StudentSelectionPage');
      void navigate('/tag-assignment');
      return;
    }
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

        // Fetch all students (no teacher filter) so any staff can assign bracelets
        const teacherIds: number[] = [];

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

  // Derive available grades from student school_class (e.g. "3C" → grade "3")
  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    entities.forEach(e => {
      if (e.type === 'student' && e.data.school_class) {
        const grade = /^(\d+)/.exec(e.data.school_class)?.[1];
        if (grade) grades.add(grade);
      }
    });
    return Array.from(grades).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  }, [entities]);

  // Derive available sections within the selected grade (e.g. "3C" → section "C")
  const availableSections = useMemo(() => {
    if (!gradeFilter) return [];
    const sections = new Set<string>();
    entities.forEach(e => {
      if (e.type === 'student' && e.data.school_class) {
        const match = /^(\d+)(.*)/.exec(e.data.school_class);
        if (match?.[1] === gradeFilter && match[2]) {
          sections.add(match[2]);
        }
      }
    });
    return Array.from(sections).sort((a, b) => a.localeCompare(b, 'de'));
  }, [entities, gradeFilter]);

  // Derive all available OGS groups
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    entities.forEach(e => {
      if (e.type === 'student' && e.data.group_name) groups.add(e.data.group_name);
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b, 'de'));
  }, [entities]);

  // Combined filter logic: grade, section, group, staff-only
  const filteredEntities = useMemo(() => {
    const filtered = entities.filter(e => {
      if (showStaffOnly) return e.type === 'teacher';

      if (gradeFilter || sectionFilter || groupFilter) {
        if (e.type === 'teacher') return false;
        const student = e.data;

        if (gradeFilter) {
          const grade = /^(\d+)/.exec(student.school_class ?? '')?.[1];
          if (grade !== gradeFilter) return false;
        }
        if (sectionFilter) {
          const section = /^\d+(.*)/.exec(student.school_class ?? '')?.[1];
          if (section !== sectionFilter) return false;
        }
        if (groupFilter) {
          if (student.group_name !== groupFilter) return false;
        }
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const an =
        a.type === 'student' ? `${a.data.last_name} ${a.data.first_name}` : a.data.display_name;
      const bn =
        b.type === 'student' ? `${b.data.last_name} ${b.data.first_name}` : b.data.display_name;
      return an.localeCompare(bn, 'de');
    });
  }, [entities, gradeFilter, sectionFilter, groupFilter, showStaffOnly]);

  // Pagination hook
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedEntities,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
    resetPage,
  } = usePagination(filteredEntities, { itemsPerPage: ENTITIES_PER_PAGE });

  // Reset pagination and selection when any filter changes
  useEffect(() => {
    resetPage();
    setSelectedEntityId(null);
  }, [gradeFilter, sectionFilter, groupFilter, showStaffOnly, resetPage]);

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
        clearTagScan(state.scannedTag);

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
      logger.error('Failed to assign tag', { error: serializeError(error) });
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

  // Get display name and badge info from entity
  const getEntityDisplayInfo = (entity: AssignableEntity) => {
    if (entity.type === 'student') {
      return {
        name: `${entity.data.first_name} ${entity.data.last_name}`,
        badge: entity.data.school_class ?? 'Schüler',
        badgeColor: 'green' as const,
      };
    }
    return {
      name: entity.data.display_name,
      badge: 'Betreuer',
      badgeColor: 'blue' as const,
    };
  };

  // Get entity ID for selection tracking
  const getEntityId = (entity: AssignableEntity): string => {
    return entity.type === 'student'
      ? `student-${entity.data.student_id}`
      : `teacher-${entity.data.staff_id}`;
  };

  if (!authenticatedUser || !state?.scannedTag) {
    return null;
  }

  const noFiltersActive = !gradeFilter && !sectionFilter && !groupFilter && !showStaffOnly;

  const chipStyle = (active: boolean): React.CSSProperties => ({
    height: '52px',
    padding: '0 20px',
    borderRadius: designSystem.borderRadius.full,
    border: active ? 'none' : '1px solid #E5E7EB',
    background: active ? designSystem.gradients.blueRight : '#FFFFFF',
    color: active ? '#FFFFFF' : '#374151',
    fontSize: '17px',
    fontWeight: 600,
    boxShadow: active ? designSystem.shadows.blue : 'none',
    cursor: 'pointer',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  });

  const handleResetAll = () => {
    setGradeFilter(null);
    setSectionFilter(null);
    setGroupFilter(null);
    setShowStaffOnly(false);
  };

  const handleStaffToggle = () => {
    if (showStaffOnly) {
      setShowStaffOnly(false);
    } else {
      setShowStaffOnly(true);
      setGradeFilter(null);
      setSectionFilter(null);
      setGroupFilter(null);
    }
  };

  const handleGradeSelect = (grade: string) => {
    if (gradeFilter === grade) {
      setGradeFilter(null);
      setSectionFilter(null);
    } else {
      setGradeFilter(grade);
      setSectionFilter(null);
      setShowStaffOnly(false);
    }
  };

  const handleSectionSelect = (section: string) => {
    setSectionFilter(sectionFilter === section ? null : section);
  };

  const handleGroupSelect = (group: string) => {
    setGroupFilter(group);
    setShowStaffOnly(false);
    setShowGroupPicker(false);
  };

  const filterContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        marginTop: '8px',
      }}
    >
      {/* Row 1: Type + Class hierarchy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button onClick={handleResetAll} style={chipStyle(noFiltersActive)}>
          Alle
        </button>
        <button onClick={handleStaffToggle} style={chipStyle(showStaffOnly)}>
          Betreuer
        </button>

        {/* Visual separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            backgroundColor: '#D1D5DB',
            margin: '0 4px',
          }}
        />

        {/* Grade chips */}
        <span style={{ color: '#6B7280', fontSize: '16px', fontWeight: 600 }}>Klasse:</span>
        {availableGrades.map(grade => (
          <button
            key={grade}
            onClick={() => handleGradeSelect(grade)}
            style={chipStyle(gradeFilter === grade)}
          >
            {grade}
          </button>
        ))}

        {/* Section chips (only when grade selected) */}
        {gradeFilter && availableSections.length > 0 && (
          <>
            {availableSections.map(section => (
              <button
                key={section}
                onClick={() => handleSectionSelect(section)}
                style={chipStyle(sectionFilter === section)}
              >
                {section}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Row 2: OGS Group selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#6B7280', fontSize: '16px', fontWeight: 600 }}>OGS-Gruppe:</span>
        {groupFilter ? (
          <button
            onClick={() => setGroupFilter(null)}
            style={{
              ...chipStyle(true),
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {groupFilter}
            <span style={{ fontSize: '16px', lineHeight: 1 }}>&times;</span>
          </button>
        ) : (
          <button
            onClick={() => setShowGroupPicker(true)}
            style={{
              ...chipStyle(false),
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Alle Gruppen
            <span style={{ fontSize: '12px', lineHeight: 1 }}>&#9662;</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <SelectionPageLayout
        title="Person auswählen"
        onBack={handleBack}
        isLoading={isLoading}
        error={showErrorModal ? null : error}
        headerContent={filterContent}
      >
        {entities.length === 0 ? (
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
            <SelectableGrid
              items={paginatedEntities}
              renderItem={entity => {
                const entityId = getEntityId(entity);
                const { name, badge, badgeColor } = getEntityDisplayInfo(entity);
                const isSelected = selectedEntityId === entityId;

                return (
                  <SelectableCard
                    key={entityId}
                    name={name}
                    icon="person"
                    colorType="person"
                    isSelected={isSelected}
                    badge={badge}
                    badgeColor={badgeColor}
                    onClick={() => handleEntitySelect(entity)}
                  />
                );
              }}
              emptySlotCount={emptySlotCount}
              emptySlotIcon="person"
              keyPrefix={`student-page-${currentPage}`}
            />

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={goToPrevPage}
              onNextPage={goToNextPage}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
            />

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
              <button
                onClick={handleAssignTag}
                disabled={!selectedEntityId || isSaving}
                style={{
                  height: '68px',
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
      </SelectionPageLayout>

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={error ?? ''}
        autoCloseDelay={3000}
      />

      {/* OGS Group Picker Modal */}
      <ModalBase isOpen={showGroupPicker} onClose={() => setShowGroupPicker(false)} size="md">
        <h2
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: '#1F2937',
            marginBottom: '20px',
          }}
        >
          OGS-Gruppe wählen
        </h2>

        <button
          onClick={() => {
            setGroupFilter(null);
            setShowGroupPicker(false);
          }}
          style={{
            width: '100%',
            height: '48px',
            marginBottom: '16px',
            borderRadius: designSystem.borderRadius.md,
            border: '1px solid #E5E7EB',
            background: !groupFilter ? designSystem.gradients.blueRight : '#FFFFFF',
            color: !groupFilter ? '#FFFFFF' : '#374151',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Alle Gruppen
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {availableGroups.map(group => (
            <button
              key={group}
              onClick={() => handleGroupSelect(group)}
              style={{
                height: '48px',
                borderRadius: designSystem.borderRadius.md,
                border: groupFilter === group ? 'none' : '1px solid #E5E7EB',
                background: groupFilter === group ? designSystem.gradients.blueRight : '#FFFFFF',
                color: groupFilter === group ? '#FFFFFF' : '#374151',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: groupFilter === group ? designSystem.shadows.blue : 'none',
              }}
            >
              {group}
            </button>
          ))}
        </div>
      </ModalBase>
    </>
  );
}

export default StudentSelectionPage;
