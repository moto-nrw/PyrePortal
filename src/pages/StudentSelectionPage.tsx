import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import {
  ErrorModal,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { useEntityFetching, type AssignableEntity } from '../hooks/useEntityFetching';
import { usePagination } from '../hooks/usePagination';
import { useTagAssignment } from '../hooks/useTagAssignment';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logUserAction } from '../utils/logger';

const ENTITIES_PER_PAGE = 10; // 5x2 grid to use full width

// ============================================================================
// Pure helper functions (moved outside component to reduce cognitive complexity)
// ============================================================================

/** Get unique identifier for an entity */
function getEntityId(entity: AssignableEntity): string {
  return entity.type === 'student'
    ? `student-${entity.data.student_id}`
    : `teacher-${entity.data.staff_id}`;
}

/** Get display name for an entity */
function getEntityName(entity: AssignableEntity): string {
  return entity.type === 'student'
    ? `${entity.data.first_name} ${entity.data.last_name}`
    : entity.data.display_name;
}

/** Get sortable name for an entity (last name first for students) */
function getEntitySortName(entity: AssignableEntity): string {
  return entity.type === 'student'
    ? `${entity.data.last_name} ${entity.data.first_name}`
    : entity.data.display_name;
}

/** Check if entity matches the selected filter */
function entityMatchesFilter(entity: AssignableEntity, filter: string | null): boolean {
  if (!filter) return true;
  if (filter === 'betreuer') return entity.type === 'teacher';
  // Class filter - only students
  if (entity.type !== 'student') return false;
  return (entity.data.school_class ?? '') === filter;
}

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

  // Use extracted hook for entity fetching (reduces cognitive complexity)
  const {
    entities,
    isLoading,
    error: fetchError,
    availableClasses,
  } = useEntityFetching({
    pin: authenticatedUser?.pin,
    staffId: authenticatedUser?.staffId,
    supervisorIds: selectedSupervisors.map(s => s.id),
    isAuthenticated: !!authenticatedUser,
  });

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const logger = useMemo(() => createLogger('StudentSelectionPage'), []);

  // Use extracted hook for tag assignment (reduces cognitive complexity)
  const { isSaving, error, showErrorModal, setShowErrorModal, handleAssignTag, handleBack } =
    useTagAssignment(entities, selectedEntityId, state);

  // Sync fetch error to show modal
  useEffect(() => {
    if (fetchError) {
      setShowErrorModal(true);
    }
  }, [fetchError, setShowErrorModal]);

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

  // Apply filter by type or class
  const filteredEntities = useMemo(() => {
    return entities
      .filter(e => entityMatchesFilter(e, selectedFilter))
      .sort((a, b) => getEntitySortName(a).localeCompare(getEntitySortName(b), 'de'));
  }, [entities, selectedFilter]);

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

  // Reset pagination and selection when filter changes
  useEffect(() => {
    resetPage();
    setSelectedEntityId(null);
  }, [selectedFilter, resetPage]);

  const handleEntitySelect = (entity: AssignableEntity) => {
    const entityId = getEntityId(entity);
    const entityName = getEntityName(entity);

    logger.info('Entity selected', { type: entity.type, name: entityName, id: entityId });
    setSelectedEntityId(entityId);
    logUserAction('entity_selection', {
      type: entity.type,
      name: entityName,
      tagId: state.scannedTag,
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

  if (!authenticatedUser || !state?.scannedTag) {
    return null;
  }

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
        message={error ?? fetchError ?? ''}
        autoCloseDelay={3000}
      />
    </>
  );
}

export default StudentSelectionPage;
