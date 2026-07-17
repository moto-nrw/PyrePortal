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
import { useStudentFilter, type AssignableEntity } from '../hooks/useStudentFilter';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logUserAction, serializeError } from '../utils/logger';

const ENTITIES_PER_PAGE = 5; // 5x1 grid — filters are primary navigation

/** User-facing German UI copy for this page */
const texts = {
  title: 'Person auswählen',
  loadError: (message: string) => `Fehler beim Laden: ${message}`,
  noPersonSelectedError: 'Bitte wählen Sie eine Person aus.',
  invalidSelectionError: 'Ungültige Auswahl',
  assignFailedError: 'Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.',
  studentBadge: 'Schüler',
  staffBadge: 'Betreuer',
  filterAll: 'Alle',
  filterStaff: 'Betreuer',
  filterGradeLabel: 'Klasse:',
  filterGroupLabel: 'OGS-Gruppe:',
  allGroups: 'Alle Gruppen',
  noEntitiesHeading: 'Keine Personen gefunden',
  noEntitiesHint: 'Es sind keine Schüler oder Betreuer verfügbar.',
  assignButtonSaving: 'Zuweisen...',
  assignButton: 'Armband zuweisen',
  groupPickerHeading: 'OGS-Gruppe wählen',
} as const;

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
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const {
    gradeFilter,
    sectionFilter,
    groupFilter,
    showStaffOnly,
    availableGrades,
    availableSections,
    availableGroups,
    filteredEntities,
    noFiltersActive,
    resetAll,
    toggleStaffOnly,
    selectGrade,
    selectSection,
    selectGroup,
    clearGroupFilter,
  } = useStudentFilter(entities);

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
        setError(texts.loadError(error.message));
        setShowErrorModal(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (authenticatedUser) {
      void fetchEntities();
    }
  }, [authenticatedUser, selectedSupervisors, logger]);

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
      setError(texts.noPersonSelectedError);
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
      setError(texts.invalidSelectionError);
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
      setError(texts.assignFailedError);
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
        badge: entity.data.school_class ?? texts.studentBadge,
        badgeColor: 'green' as const,
      };
    }
    return {
      name: entity.data.display_name,
      badge: texts.staffBadge,
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

  const chipStyle = (active: boolean): React.CSSProperties => ({
    height: '52px',
    padding: '0 20px',
    borderRadius: designSystem.borderRadius.full,
    border: active ? 'none' : `1px solid ${designSystem.gray[200]}`,
    background: active ? designSystem.brand.blue : designSystem.surface.background,
    color: active ? designSystem.colors.white : designSystem.gray[700],
    fontSize: '17px',
    fontWeight: 600,
    boxShadow: 'none',
    cursor: 'pointer',
    outline: 'none',
    transition: designSystem.transitions.base,
  });

  const handleGroupSelect = (group: string) => {
    selectGroup(group);
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
        <button onClick={resetAll} style={chipStyle(noFiltersActive)}>
          {texts.filterAll}
        </button>
        <button onClick={toggleStaffOnly} style={chipStyle(showStaffOnly)}>
          {texts.filterStaff}
        </button>

        {/* Visual separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            backgroundColor: designSystem.gray[300],
            margin: '0 4px',
          }}
        />

        {/* Grade chips */}
        <span style={{ color: designSystem.gray[500], fontSize: '16px', fontWeight: 600 }}>
          {texts.filterGradeLabel}
        </span>
        {availableGrades.map(grade => (
          <button
            key={grade}
            onClick={() => selectGrade(grade)}
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
                onClick={() => selectSection(section)}
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
        <span style={{ color: designSystem.gray[500], fontSize: '16px', fontWeight: 600 }}>
          {texts.filterGroupLabel}
        </span>
        {groupFilter ? (
          <button
            onClick={clearGroupFilter}
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
            {texts.allGroups}
            <span style={{ fontSize: '12px', lineHeight: 1 }}>&#9662;</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <SelectionPageLayout
        title={texts.title}
        onBack={handleBack}
        isLoading={isLoading}
        error={showErrorModal ? null : error}
        headerContent={filterContent}
      >
        {entities.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '64px 40px',
              border: `1px dashed ${designSystem.gray[200]}`,
              background: 'rgba(249,250,251,0.4)',
              borderRadius: designSystem.borderRadius.xl,
              color: designSystem.gray[500],
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '96px',
                height: '96px',
                borderRadius: designSystem.borderRadius.full,
                background: designSystem.gray[100],
                marginBottom: '20px',
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
              {texts.noEntitiesHeading}
            </p>
            <p style={{ fontSize: '16px' }}>{texts.noEntitiesHint}</p>
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
                onMouseEnter={e => {
                  if (!(!selectedEntityId || isSaving)) {
                    e.currentTarget.style.background = designSystem.flat.successHover;
                  }
                }}
                onMouseLeave={e => {
                  if (!(!selectedEntityId || isSaving)) {
                    e.currentTarget.style.background = designSystem.flat.success;
                  }
                }}
                style={{
                  height: '68px',
                  padding: '0 64px',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: designSystem.colors.white,
                  background:
                    !selectedEntityId || isSaving
                      ? designSystem.gray[400]
                      : designSystem.flat.success,
                  border: 'none',
                  borderRadius: designSystem.borderRadius.full,
                  cursor: !selectedEntityId || isSaving ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  boxShadow: !selectedEntityId || isSaving ? 'none' : designSystem.shadows.md,
                  opacity: !selectedEntityId || isSaving ? 0.6 : 1,
                  transition: designSystem.transitions.base,
                }}
              >
                {isSaving ? texts.assignButtonSaving : texts.assignButton}
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
            color: designSystem.gray[800],
            marginBottom: '20px',
          }}
        >
          {texts.groupPickerHeading}
        </h2>

        <button
          onClick={() => {
            clearGroupFilter();
            setShowGroupPicker(false);
          }}
          style={{
            width: '100%',
            height: '48px',
            marginBottom: '16px',
            borderRadius: designSystem.borderRadius.md,
            border: !groupFilter ? 'none' : `1px solid ${designSystem.gray[200]}`,
            background: !groupFilter ? designSystem.brand.blue : designSystem.surface.background,
            color: !groupFilter ? designSystem.colors.white : designSystem.gray[700],
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            transition: designSystem.transitions.base,
          }}
        >
          {texts.allGroups}
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
                border: groupFilter === group ? 'none' : `1px solid ${designSystem.gray[200]}`,
                background:
                  groupFilter === group ? designSystem.brand.blue : designSystem.surface.background,
                color: groupFilter === group ? designSystem.colors.white : designSystem.gray[700],
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                boxShadow: 'none',
                transition: designSystem.transitions.base,
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
