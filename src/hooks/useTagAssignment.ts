import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger, logUserAction } from '../utils/logger';

import type { AssignableEntity } from './useEntityFetching';

// ============================================================================
// Types
// ============================================================================

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

interface UseTagAssignmentResult {
  isSaving: boolean;
  error: string | null;
  showErrorModal: boolean;
  setShowErrorModal: (show: boolean) => void;
  handleAssignTag: () => Promise<void>;
  handleBack: () => void;
}

// ============================================================================
// Pure helper functions
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

// ============================================================================
// API call functions (pure, extracted to reduce complexity)
// ============================================================================

async function assignTagToEntity(
  entity: AssignableEntity,
  pin: string,
  tagId: string
): Promise<{ success: boolean; previous_tag?: string; message?: string }> {
  if (entity.type === 'teacher') {
    return api.assignStaffTag(pin, entity.data.staff_id, tagId);
  }
  return api.assignTag(pin, entity.data.student_id, tagId);
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Custom hook that encapsulates tag assignment logic.
 * This moves cognitive complexity out of StudentSelectionPage.
 */
export function useTagAssignment(
  entities: AssignableEntity[],
  selectedEntityId: string | null,
  state: LocationState | null
): UseTagAssignmentResult {
  const { authenticatedUser } = useUserStore();
  const navigate = useNavigate();
  const logger = useMemo(() => createLogger('useTagAssignment'), []);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const handleAssignTag = useCallback(async () => {
    // Validate prerequisites
    if (!selectedEntityId || !authenticatedUser?.pin || !state?.scannedTag) {
      logger.warn('Invalid assignment attempt');
      setError('Bitte wählen Sie eine Person aus.');
      setShowErrorModal(true);
      return;
    }

    setIsSaving(true);

    // Find selected entity
    const selectedEntity = entities.find(e => getEntityId(e) === selectedEntityId);

    if (!selectedEntity) {
      setError('Ungültige Auswahl');
      setShowErrorModal(true);
      setIsSaving(false);
      return;
    }

    try {
      const entityName = getEntityName(selectedEntity);

      logger.info('Assigning tag to entity', {
        type: selectedEntity.type,
        tagId: state.scannedTag,
        entityName,
      });

      const result = await assignTagToEntity(
        selectedEntity,
        authenticatedUser.pin,
        state.scannedTag
      );

      if (!result.success) {
        throw new Error(result.message ?? 'Armband-Zuweisung fehlgeschlagen');
      }

      logUserAction('tag_assignment_complete', {
        type: selectedEntity.type,
        tagId: state.scannedTag,
        entityName,
      });

      // Navigate back with success message
      // NOSONAR: void required by ESLint for fire-and-forget navigation
      void navigate('/tag-assignment', {
        state: {
          assignmentSuccess: true,
          studentName: entityName,
          previousTag: result.previous_tag,
          scannedTag: state.scannedTag,
          tagAssignment: state.tagAssignment,
        },
      });
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to assign tag', { error: errorObj });
      setError('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.');
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
    }
  }, [selectedEntityId, authenticatedUser?.pin, state, entities, logger, navigate]);

  const handleBack = useCallback(() => {
    logger.info('User navigating back to tag assignment');
    logUserAction('student_selection_back');

    if (!state) {
      void navigate('/tag-assignment'); // NOSONAR - void required by ESLint for fire-and-forget navigation
      return;
    }

    // Pass back the scan state so TagAssignmentPage shows the scan result
    // NOSONAR: void required by ESLint for fire-and-forget navigation
    void navigate('/tag-assignment', {
      state: {
        scannedTag: state.scannedTag,
        tagAssignment: state.tagAssignment,
      },
    });
  }, [state, logger, navigate]);

  return {
    isSaving,
    error,
    showErrorModal,
    setShowErrorModal,
    handleAssignTag,
    handleBack,
  };
}
