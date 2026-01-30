import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ContinueButton,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { usePagination } from '../hooks/usePagination';
import { useUserStore } from '../store/userStore';
import { createLogger, logNavigation, logUserAction } from '../utils/logger';

function StaffSelectionPage() {
  const {
    users,
    fetchTeachers,
    selectedSupervisors,
    toggleSupervisor,
    isLoading,
    error,
    selectedActivity,
    authenticatedUser,
  } = useUserStore();

  const navigate = useNavigate();
  const logger = useMemo(() => createLogger('StaffSelectionPage'), []);

  // Freeze sort order after first user interaction to prevent items from moving
  const frozenSortOrder = useRef<Map<number, number> | null>(null);

  // Sort: pre-selected at top on page load, then freeze after first interaction
  const sortedUsers = useMemo(() => {
    if (frozenSortOrder.current) {
      return [...users].sort((a, b) => {
        const aOrder = frozenSortOrder.current!.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = frozenSortOrder.current!.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
    }
    const selectedIds = new Set(selectedSupervisors.map(s => s.id));
    return [...users].sort((a, b) => {
      const aSel = selectedIds.has(a.id);
      const bSel = selectedIds.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [users, selectedSupervisors]);

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

  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to StaffSelectionPage');
      void navigate('/');
      return;
    }
    if (!selectedActivity) {
      logger.warn('No activity selected, redirecting to activity selection');
      void navigate('/activity-selection');
      return;
    }
    logger.debug('StaffSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
    });
  }, [authenticatedUser, selectedActivity, navigate, logger]);

  useEffect(() => {
    fetchTeachers().catch(err => {
      logger.error('Failed to fetch teachers on mount', { error: err });
    });
  }, [fetchTeachers, logger]);

  const handleUserToggle = (user: { id: number; name: string }) => {
    // Freeze sort order on first interaction so items don't move
    if (!frozenSortOrder.current) {
      const orderMap = new Map<number, number>();
      sortedUsers.forEach((u, idx) => orderMap.set(u.id, idx));
      frozenSortOrder.current = orderMap;
    }

    logger.info('Toggling supervisor selection', {
      username: user.name,
      userId: user.id,
      wasSelected: selectedSupervisors.some(s => s.id === user.id),
    });
    toggleSupervisor(user);
    logUserAction('supervisor_toggle', {
      username: user.name,
      userId: user.id,
      selected: !selectedSupervisors.some(s => s.id === user.id),
    });
  };

  const handleContinue = () => {
    if (selectedSupervisors.length === 0) {
      logger.warn('Attempted to continue without selecting supervisors');
      return;
    }
    logger.info('Continuing with selected supervisors', {
      count: selectedSupervisors.length,
      supervisors: selectedSupervisors.map(s => ({ id: s.id, name: s.name })),
    });
    logUserAction('supervisors_selected', {
      count: selectedSupervisors.length,
      supervisorIds: selectedSupervisors.map(s => s.id),
    });
    logNavigation('StaffSelectionPage', 'RoomSelectionPage');
    void navigate('/rooms');
  };

  const handleBack = () => {
    logger.info('User navigating back to activity selection');
    logUserAction('staff_selection_back');
    logNavigation('StaffSelectionPage', 'CreateActivityPage', { reason: 'user_back' });
    void navigate('/activity-selection');
  };

  const isUserSelected = (userId: number) => selectedSupervisors.some(s => s.id === userId);

  if (!authenticatedUser || !selectedActivity) {
    return null;
  }

  return (
    <SelectionPageLayout
      title="Betreuer auswählen"
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
            colorType="staff"
            isSelected={isUserSelected(user.id)}
            onClick={() => handleUserToggle(user)}
          />
        )}
        emptySlotCount={emptySlotCount}
        emptySlotIcon="person"
        keyPrefix={`staff-page-${currentPage}`}
      />

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevPage={goToPrevPage}
        onNextPage={goToNextPage}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
      />

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        <ContinueButton onClick={handleContinue} disabled={selectedSupervisors.length === 0} />
      </div>
    </SelectionPageLayout>
  );
}

export default StaffSelectionPage;
