import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import {
  ContinueButton,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
} from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { usePagination } from '../hooks/usePagination';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
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

  // Create stable logger instance for this component
  const logger = useMemo(() => createLogger('StaffSelectionPage'), []);

  // Pagination hook
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedUsers,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
  } = usePagination(users, { itemsPerPage: 10 });

  // Redirect if missing authentication or selected activity
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

    return () => {
      logger.debug('StaffSelectionPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, navigate, logger]);

  // Log component mount and fetch teachers once
  useEffect(() => {
    // Always fetch teachers on mount (the store will handle deduplication)
    fetchTeachers().catch(error => {
      logger.error('Failed to fetch teachers on mount', { error });
    });
  }, [fetchTeachers, logger]);

  const handleUserToggle = (user: { id: number; name: string }) => {
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
    logger.info('User navigating back to activity selection');
    logUserAction('staff_selection_back');
    logNavigation('StaffSelectionPage', 'CreateActivityPage', { reason: 'user_back' });
    void navigate('/activity-selection');
  };

  const isUserSelected = (userId: number) => {
    return selectedSupervisors.some(s => s.id === userId);
  };

  if (!authenticatedUser || !selectedActivity) {
    return null; // Will redirect via useEffect
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
        }}
      >
        {/* Modern back button following tablet/mobile conventions */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <BackButton onClick={handleBack} />
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
          Betreuer auswählen
        </h1>

        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              padding: theme.spacing.md,
              borderRadius: theme.borders.radius.md,
              marginBottom: theme.spacing.lg,
              textAlign: 'center',
              fontSize: '16px',
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
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
          </div>
        ) : (
          <>
            {/* User Grid */}
            <SelectableGrid
              items={paginatedUsers}
              renderItem={user => (
                <SelectableCard
                  key={user.id}
                  id={user.id}
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

            {/* Pagination Controls */}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
            />

            {/* Continue button */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: '24px',
              }}
            >
              <ContinueButton
                onClick={handleContinue}
                disabled={selectedSupervisors.length === 0}
              />
            </div>
          </>
        )}

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

export default StaffSelectionPage;
