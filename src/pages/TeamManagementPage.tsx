import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ErrorModal,
  SuccessModal,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { usePagination } from '../hooks/usePagination';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { createLogger, logNavigation, logUserAction } from '../utils/logger';

function TeamManagementPage() {
  const {
    users,
    fetchTeachers,
    selectedSupervisors,
    toggleSupervisor,
    setSelectedSupervisors,
    isLoading,
    error,
    authenticatedUser,
    currentSession,
  } = useUserStore();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Track selection order so selected supervisors can be shown first (chronologically)
  const [selectionOrder, setSelectionOrder] = useState<Map<number, number>>(new Map());
  const orderCounter = useRef(0);
  const navigate = useNavigate();

  // Create stable logger instance for this component
  const logger = useMemo(() => createLogger('TeamManagementPage'), []);

  // Sort users: selected first (by chronological selection), then others alphabetically
  const sortedUsers = useMemo(() => {
    const selectedIds = new Set(selectedSupervisors.map(s => s.id));
    return [...users].sort((a, b) => {
      const aSel = selectedIds.has(a.id);
      const bSel = selectedIds.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      if (aSel && bSel) {
        const ao = selectionOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bo = selectionOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ao - bo;
      }
      return a.name.localeCompare(b.name, 'de');
    });
  }, [users, selectedSupervisors, selectionOrder]);

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
    resetPage,
  } = usePagination(sortedUsers, { itemsPerPage: 10 });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to TeamManagementPage');
      void navigate('/');
      return;
    }

    logger.debug('TeamManagementPage component mounted', {
      user: authenticatedUser.staffName,
      hasActiveSession: !!currentSession,
    });

    return () => {
      logger.debug('TeamManagementPage component unmounted');
    };
  }, [authenticatedUser, currentSession, navigate, logger]);

  // Fetch teachers and initialize supervisors
  useEffect(() => {
    const initializePage = async () => {
      try {
        // Always refresh to pick up newly added supervisors
        await fetchTeachers(true);

        // If we have an active session and no supervisors selected yet,
        // initialize with current session supervisors
        if (currentSession && selectedSupervisors.length === 0) {
          // Fetch current session details to get supervisors
          const sessionDetails = await api.getCurrentSession(authenticatedUser!.pin);
          if (sessionDetails && 'supervisors' in sessionDetails) {
            // Map supervisor info to user format
            const currentSupervisors =
              sessionDetails.supervisors?.map(sup => ({
                id: sup.staff_id,
                name: sup.display_name,
              })) ?? [];
            setSelectedSupervisors(currentSupervisors);
          }
        }
      } catch (error) {
        logger.error('Failed to initialize team management page', { error });
      }
    };

    if (authenticatedUser) {
      void initializePage();
    }
  }, [
    authenticatedUser,
    currentSession,
    fetchTeachers,
    selectedSupervisors.length,
    setSelectedSupervisors,
    logger,
  ]);

  // Initialize selection order from existing selected supervisors (e.g., from session)
  useEffect(() => {
    if (selectionOrder.size === 0 && selectedSupervisors.length > 0) {
      const map = new Map<number, number>();
      selectedSupervisors.forEach((s, idx) => map.set(s.id, idx + 1));
      setSelectionOrder(map);
      orderCounter.current = selectedSupervisors.length;
    }
  }, [selectedSupervisors, selectionOrder.size]);

  const handleUserToggle = (user: { id: number; name: string }) => {
    logger.info('Toggling supervisor selection', {
      username: user.name,
      userId: user.id,
      wasSelected: selectedSupervisors.some(s => s.id === user.id),
    });

    const wasSelected = selectedSupervisors.some(s => s.id === user.id);
    if (wasSelected) {
      // Remove from selection order map
      if (selectionOrder.has(user.id)) {
        const next = new Map(selectionOrder);
        next.delete(user.id);
        setSelectionOrder(next);
      }
    } else {
      // Add with next chronological order
      const next = new Map(selectionOrder);
      next.set(user.id, ++orderCounter.current);
      setSelectionOrder(next);
      // Jump to page 1 to reveal selected at the front
      resetPage();
    }

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
      setErrorMessage('Bitte wählen Sie mindestens einen Betreuer aus.');
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
        await api.updateSessionSupervisors(
          authenticatedUser!.pin,
          currentSession.active_group_id,
          selectedSupervisors.map(s => s.id)
        );
        logger.info('Successfully updated session supervisors');
      }

      // Show success modal - navigation happens when modal closes
      setShowSuccessModal(true);
    } catch (error) {
      logger.error('Failed to update supervisors', { error });
      setErrorMessage('Fehler beim Aktualisieren der Betreuer. Bitte versuchen Sie es erneut.');
      setShowErrorModal(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNextPage = () => {
    goToNextPage();
    logger.debug('Navigated to next page', { newPage: currentPage + 1, totalPages });
  };

  const handlePrevPage = () => {
    goToPrevPage();
    logger.debug('Navigated to previous page', { newPage: currentPage - 1, totalPages });
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
      title="Team anpassen"
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
            WebkitTapHighlightColor: 'transparent',
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
          {isSaving ? 'Speichern...' : 'Team speichern'}
        </button>
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          logNavigation('TeamManagementPage', 'HomeViewPage');
          void navigate('/home');
        }}
        message={
          currentSession ? 'Team erfolgreich aktualisiert!' : 'Team erfolgreich gespeichert!'
        }
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
