import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ErrorModal,
  SuccessModal,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { useFrozenSortOrder } from '../hooks/useFrozenSortOrder';
import { usePagination } from '../hooks/usePagination';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction, serializeError } from '../utils/logger';

/** User-facing German UI copy for this page */
const texts = {
  title: 'Team anpassen',
  noSupervisorSelectedError: 'Bitte wählen Sie mindestens einen Betreuer aus.',
  updateFailedError: 'Fehler beim Aktualisieren der Betreuer. Bitte versuchen Sie es erneut.',
  saveButtonSaving: 'Speichern...',
  saveButton: 'Team speichern',
  successUpdated: 'Team erfolgreich aktualisiert!',
  successSaved: 'Team erfolgreich gespeichert!',
} as const;

function TeamManagementPage() {
  const {
    users,
    fetchTeachers,
    selectedSupervisors,
    toggleSupervisor,
    setSelectedSupervisors,
    loadSessionSupervisors,
    isLoading,
    error,
    authenticatedUser,
    currentSession,
  } = useUserStore();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  // Create stable logger instance for this component
  const logger = useMemo(() => createLogger('TeamManagementPage'), []);

  // Sort: pre-selected at top on page load, then freeze after first interaction
  const { sortedItems: sortedUsers, freezeSortOrder } = useFrozenSortOrder(
    users,
    selectedSupervisors
  );

  // Pagination hook with sorted users
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedUsers,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
  } = usePagination(sortedUsers, { itemsPerPage: 10 });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to TeamManagementPage');
      void navigate('/');
      return;
    }
  }, [authenticatedUser, currentSession, navigate, logger]);

  // Fetch teachers and initialize supervisors
  useEffect(() => {
    const initializePage = async () => {
      try {
        // Always refresh to pick up newly added supervisors
        await fetchTeachers(true);

        // Always refresh supervisors from backend when there's an active session
        if (currentSession) {
          await loadSessionSupervisors();
        }
      } catch (error) {
        logger.error('Failed to initialize team management page', { error: serializeError(error) });
      }
    };

    if (authenticatedUser) {
      void initializePage();
    }
  }, [authenticatedUser, currentSession, fetchTeachers, loadSessionSupervisors, logger]);

  const handleUserToggle = (user: { id: number; name: string }) => {
    // Freeze sort order on first interaction so items don't move
    freezeSortOrder();

    logger.info('Toggling supervisor selection', {
      username: user.name,
      userId: user.id,
      wasSelected: selectedSupervisors.some(s => s.id === user.id),
    });

    toggleSupervisor(user);

    logUserAction('team_supervisor_toggle', {
      username: user.name,
      userId: user.id,
      selected: !selectedSupervisors.some(s => s.id === user.id),
    });
  };

  const handleSave = async () => {
    if (selectedSupervisors.length === 0) {
      logger.warn('Attempted to save without selecting supervisors');
      setErrorMessage(texts.noSupervisorSelectedError);
      setShowErrorModal(true);
      return;
    }

    setIsSaving(true);
    logger.info('Saving team supervisors', {
      count: selectedSupervisors.length,
      supervisors: selectedSupervisors.map(s => ({ id: s.id, name: s.name })),
      hasActiveSession: !!currentSession,
    });

    logUserAction('team_supervisors_save', {
      count: selectedSupervisors.length,
      supervisorIds: selectedSupervisors.map(s => s.id),
      hasActiveSession: !!currentSession,
    });

    try {
      // If we have an active session, update supervisors via API
      if (currentSession) {
        const result = await api.updateSessionSupervisors(
          authenticatedUser!.pin,
          currentSession.active_group_id,
          selectedSupervisors.map(s => s.id)
        );
        logger.info('Successfully updated session supervisors');

        // Sync server-confirmed supervisors back to local cache
        if (result.supervisors) {
          setSelectedSupervisors(
            result.supervisors.map(sup => ({
              id: sup.staff_id,
              name: sup.display_name,
            }))
          );
        }
      }

      // Show success modal - navigation happens when modal closes
      setShowSuccessModal(true);
    } catch (error) {
      logger.error('Failed to update supervisors', { error: serializeError(error) });
      setErrorMessage(texts.updateFailedError);
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNextPage = () => {
    goToNextPage();
  };

  const handlePrevPage = () => {
    goToPrevPage();
  };

  // Handle back navigation
  const handleBack = () => {
    logger.info('User navigating back to home');
    logUserAction('team_management_back');
    logNavigation('TeamManagementPage', 'HomeViewPage', { reason: 'user_back' });
    void navigate('/home');
  };

  const isUserSelected = (userId: number) => {
    return selectedSupervisors.some(s => s.id === userId);
  };

  if (!authenticatedUser) {
    return null; // Will redirect via useEffect
  }

  return (
    <SelectionPageLayout
      title={texts.title}
      onBack={handleBack}
      isLoading={isLoading}
      error={error}
    >
      <SelectableGrid
        items={paginatedUsers}
        renderItem={user => (
          <SelectableCard
            key={user.id}
            name={user.name}
            icon="person"
            colorType="person"
            isSelected={isUserSelected(user.id)}
            onClick={() => handleUserToggle(user)}
          />
        )}
        emptySlotCount={emptySlotCount}
        emptySlotIcon="person"
        keyPrefix={`team-page-${currentPage}`}
      />

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
      />

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        <button
          onClick={handleSave}
          disabled={selectedSupervisors.length === 0 || isSaving}
          style={{
            height: '68px',
            padding: '0 64px',
            fontSize: '24px',
            fontWeight: 700,
            color: '#FFFFFF',
            backgroundColor: selectedSupervisors.length === 0 || isSaving ? '#9CA3AF' : '#83CD2D',
            border: 'none',
            borderRadius: '9999px',
            cursor: selectedSupervisors.length === 0 || isSaving ? 'not-allowed' : 'pointer',
            transition: designSystem.transitions.base,
            outline: 'none',
            boxShadow:
              selectedSupervisors.length === 0 || isSaving ? 'none' : designSystem.shadows.green,
            opacity: selectedSupervisors.length === 0 || isSaving ? 0.6 : 1,
          }}
          onTouchStart={e => {
            if (selectedSupervisors.length > 0 && !isSaving) {
              e.currentTarget.style.transform = designSystem.scales.active;
              e.currentTarget.style.boxShadow = designSystem.shadows.button;
            }
          }}
          onTouchEnd={e => {
            if (selectedSupervisors.length > 0 && !isSaving) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = designSystem.shadows.green;
            }
          }}
        >
          {isSaving ? texts.saveButtonSaving : texts.saveButton}
        </button>
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          logNavigation('TeamManagementPage', 'HomeViewPage');
          void navigate('/home');
        }}
        message={currentSession ? texts.successUpdated : texts.successSaved}
        autoCloseDelay={1000}
      />

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
        autoCloseDelay={3000}
      />
    </SelectionPageLayout>
  );
}

export default TeamManagementPage;
