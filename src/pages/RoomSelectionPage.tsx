import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ErrorModal,
  SelectableGrid,
  SelectableCard,
  PaginationControls,
  SelectionPageLayout,
} from '../components/ui';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { ConflictModal } from '../components/ui/ConflictModal';
import { usePagination } from '../hooks/usePagination';
import {
  mapServerErrorToGerman,
  isNetworkRelatedError,
  type Room,
  type CurrentSession,
} from '../services/api';
import { startSessionWithConflictHandling } from '../services/sessionService';
import { useUserStore } from '../store/userStore';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function RoomSelectionPage() {
  const {
    authenticatedUser,
    selectedActivity,
    selectedSupervisors,
    rooms,
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    setCurrentSession,
    saveLastSessionData,
  } = useUserStore();

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const navigate = useNavigate();
  const fetchedRef = useRef(false);

  // Helper to show error modal with network-aware message
  const showError = useCallback((error: unknown, fallbackMessage: string) => {
    const rawMessage = error instanceof Error ? error.message : fallbackMessage;
    const userMessage = isNetworkRelatedError(error)
      ? 'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.'
      : mapServerErrorToGerman(rawMessage);
    setErrorMessage(userMessage);
    setShowErrorModal(true);
  }, []);

  // Create logger instance for this component
  const logger = createLogger('RoomSelectionPage');

  // Pagination hook
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedRooms,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
  } = usePagination(rooms, { itemsPerPage: 10 });

  // Redirect if missing authentication, selected activity, or supervisors
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to RoomSelectionPage');
      logNavigation('RoomSelectionPage', '/');
      void navigate('/');
      return;
    }

    if (!selectedActivity) {
      logger.warn('No activity selected, redirecting to activity selection');
      logNavigation('RoomSelectionPage', '/activity-selection');
      void navigate('/activity-selection');
      return;
    }

    if (!selectedSupervisors || selectedSupervisors.length === 0) {
      logger.warn('No supervisors selected, redirecting to staff selection');
      logNavigation('RoomSelectionPage', '/staff-selection');
      void navigate('/staff-selection');
      return;
    }
  }, [authenticatedUser, selectedActivity, selectedSupervisors, navigate, logger]);

  // Fetch rooms when component mounts
  useEffect(() => {
    if (authenticatedUser && selectedActivity && !fetchedRef.current) {
      fetchedRef.current = true;
      logger.info('Fetching available rooms');
      void fetchRooms();
    }
  }, [authenticatedUser, selectedActivity, fetchRooms, logger]);

  // Handle room selection
  const handleRoomSelect = (room: Room) => {
    // Don't allow selecting occupied rooms
    if (room.is_occupied) return;

    logger.info('Room selected for confirmation', {
      roomId: room.id,
      roomName: room.name,
      activityId: selectedActivity?.id,
    });

    setSelectedRoom(room);
    setShowConfirmModal(true);
  };

  // Shared post-start flow: set session state, save, log, and navigate
  const completeSessionStart = useCallback(
    async (session: CurrentSession, actionLabel: string) => {
      if (!selectedActivity || !selectedRoom) return;

      selectRoom(selectedRoom.id);
      setCurrentSession(session);

      await saveLastSessionData();

      logUserAction(actionLabel, {
        sessionId: session.active_group_id,
        activityId: selectedActivity.id,
        activityName: selectedActivity.name,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      // Close modals before navigation
      setShowConfirmModal(false);
      setShowConflictModal(false);
      setIsStartingSession(false);
      setSelectedRoom(null);

      logNavigation('RoomSelectionPage', 'NFC-Scanning', {
        sessionId: session.active_group_id,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      void navigate('/nfc-scanning');
    },
    [selectedActivity, selectedRoom, selectRoom, setCurrentSession, saveLastSessionData, navigate]
  );

  // Handle session start confirmation
  const handleConfirmSession = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);

    logger.info('Starting activity session', {
      activityId: selectedActivity.id,
      roomId: selectedRoom.id,
      supervisorCount: selectedSupervisors.length,
      supervisorIds: selectedSupervisors.map(s => s.id),
    });

    performance.mark('session-start-begin');

    const outcome = await startSessionWithConflictHandling({
      pin: authenticatedUser.pin,
      activity: selectedActivity,
      room: selectedRoom,
      supervisorIds: selectedSupervisors.map(s => s.id),
    });

    if (outcome.status === 'started') {
      performance.mark('session-start-end');
      performance.measure('session-start-duration', 'session-start-begin', 'session-start-end');
      const measure = performance.getEntriesByName('session-start-duration')[0];

      logger.info('Session started successfully', {
        sessionId: outcome.response.active_group_id,
        activityId: outcome.response.activity_id,
        deviceId: outcome.response.device_id,
        duration_ms: measure.duration,
      });

      await completeSessionStart(outcome.session, 'session_started');
      return;
    }

    const error = outcome.error;
    const errorMessage = error instanceof Error ? error.message : 'Fehler beim Starten der Session';
    logger.error('Session start failed', {
      error: errorMessage,
      activityId: selectedActivity.id,
      roomId: selectedRoom.id,
    });

    logError(
      error instanceof Error ? error : new Error(String(error)),
      'RoomSelectionPage.handleConfirmSession'
    );

    if (outcome.status === 'conflict') {
      logger.info('Showing conflict modal due to 409 error');
      setShowConflictModal(true);
      setIsStartingSession(false);
      return;
    }

    showError(error, 'Fehler beim Starten der Aktivität');
    setIsStartingSession(false);
    setShowConfirmModal(false);
    setSelectedRoom(null);
  };

  // Handle force session start from conflict modal
  const handleForceSessionStart = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);

    logger.info('Retrying session start with force=true', {
      activityId: selectedActivity.id,
      roomId: selectedRoom.id,
    });

    const outcome = await startSessionWithConflictHandling({
      pin: authenticatedUser.pin,
      activity: selectedActivity,
      room: selectedRoom,
      supervisorIds: selectedSupervisors.map(s => s.id),
      force: true,
    });

    if (outcome.status === 'started') {
      logger.info('Session started successfully with force override', {
        sessionId: outcome.response.active_group_id,
        activityId: outcome.response.activity_id,
        deviceId: outcome.response.device_id,
      });

      await completeSessionStart(outcome.session, 'session_started_force');
      return;
    }

    const forceError = outcome.error;
    const forceErrorMessage =
      forceError instanceof Error ? forceError.message : 'Fehler beim Überschreiben der Session';
    logger.error('Force session start also failed', {
      error: forceErrorMessage,
      activityId: selectedActivity.id,
      roomId: selectedRoom.id,
    });
    showError(forceError, 'Fehler beim Überschreiben der Session');
    // Clean up modal state only on error
    setIsStartingSession(false);
    setShowConfirmModal(false);
    setShowConflictModal(false);
    setSelectedRoom(null);
  };

  // Handle conflict modal cancel
  const handleConflictCancel = () => {
    setShowConflictModal(false);
    setIsStartingSession(false);
    setShowConfirmModal(false);
    setSelectedRoom(null);
  };

  // Handle back navigation
  const handleGoBack = () => {
    logger.info('User navigating back to staff selection');
    logNavigation('RoomSelectionPage', 'StaffSelectionPage', { reason: 'back_button' });
    void navigate('/staff-selection');
  };

  const handleNextPage = () => {
    goToNextPage();
  };

  const handlePrevPage = () => {
    goToPrevPage();
  };

  if (
    !authenticatedUser ||
    !selectedActivity ||
    !selectedSupervisors ||
    selectedSupervisors.length === 0
  ) {
    return null; // Will redirect via useEffect
  }

  return (
    <>
      <SelectionPageLayout
        title="Wo machen wir das?"
        onBack={handleGoBack}
        isLoading={isLoading}
        error={error}
      >
        {rooms.length === 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9CA3AF"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
              <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
              <circle cx="11" cy="12" r="1" />
            </svg>
            <div
              style={{
                fontSize: '24px',
                color: '#6B7280',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Keine Räume verfügbar
            </div>
            <div
              style={{
                fontSize: '16px',
                color: '#9CA3AF',
                textAlign: 'center',
              }}
            >
              Es sind derzeit keine Räume für die Auswahl verfügbar.
            </div>
          </div>
        ) : (
          <>
            <SelectableGrid
              items={paginatedRooms}
              renderItem={room => (
                <SelectableCard
                  key={room.id}
                  name={room.name}
                  icon="door"
                  colorType="room"
                  isSelected={selectedRoom?.id === room.id}
                  isDisabled={room.is_occupied}
                  badge={room.capacity ? `${room.capacity} Plätze` : undefined}
                  onClick={() => handleRoomSelect(room)}
                />
              )}
              emptySlotCount={emptySlotCount}
              emptySlotIcon="door"
              keyPrefix={`room-page-${currentPage}`}
            />

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
            />
          </>
        )}
      </SelectionPageLayout>

      {selectedRoom && (
        <ConfirmationModal
          isOpen={showConfirmModal}
          activity={selectedActivity}
          room={selectedRoom}
          supervisors={selectedSupervisors}
          onConfirm={handleConfirmSession}
          onCancel={() => {
            setShowConfirmModal(false);
            setSelectedRoom(null);
          }}
          isLoading={isStartingSession}
        />
      )}

      {selectedRoom && (
        <ConflictModal
          isOpen={showConflictModal}
          activity={selectedActivity}
          room={selectedRoom}
          supervisors={selectedSupervisors}
          onForceStart={handleForceSessionStart}
          onCancel={handleConflictCancel}
          isLoading={isStartingSession}
        />
      )}

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
        autoCloseDelay={5000}
      />
    </>
  );
}

export default RoomSelectionPage;
