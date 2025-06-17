import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { api, type Room, type SessionStartRequest, type ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

interface ConfirmationModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

interface ConflictModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  onForceStart: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  activity,
  room,
  onConfirm,
  onCancel,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.light,
          borderRadius: theme.borders.radius.lg,
          padding: theme.spacing.xxl,
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: theme.shadows.lg,
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>🎯</div>

        <h2
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.primary,
          }}
        >
          Aktivität starten?
        </h2>

        <div style={{ marginBottom: theme.spacing.xl }}>
          <div
            style={{
              fontSize: theme.fonts.size.large,
              marginBottom: theme.spacing.sm,
              color: theme.colors.text.primary,
            }}
          >
            📚 {activity?.name}
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.base,
              color: theme.colors.text.secondary,
            }}
          >
            📍 {room.name}
          </div>
          {room.room_type && (
            <div
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
              }}
            >
              🏷️ {room.room_type}
            </div>
          )}
          {room.capacity && (
            <div
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
              }}
            >
              👥 Kapazität: {room.capacity}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
          <Button onClick={onCancel} variant="outline" size="large" disabled={isLoading}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} variant="primary" size="large" disabled={isLoading}>
            {isLoading ? 'Starte...' : 'Aktivität starten'}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  activity,
  room,
  onForceStart,
  onCancel,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.light,
          borderRadius: theme.borders.radius.lg,
          padding: theme.spacing.xxl,
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: theme.shadows.lg,
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>⚠️</div>

        <h2
          style={{
            fontSize: theme.fonts.size.xl,
            fontWeight: theme.fonts.weight.bold,
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.primary,
          }}
        >
          Session Konflikt
        </h2>

        <div style={{ marginBottom: theme.spacing.xl }}>
          <div
            style={{
              fontSize: theme.fonts.size.base,
              marginBottom: theme.spacing.md,
              color: theme.colors.text.secondary,
              lineHeight: '1.5',
            }}
          >
            Es läuft bereits eine Session für diese Aktivität oder diesen Raum.
          </div>

          <div
            style={{
              fontSize: theme.fonts.size.base,
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.secondary,
              lineHeight: '1.5',
            }}
          >
            Möchten Sie die bestehende Session beenden und eine neue starten?
          </div>

          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: theme.borders.radius.md,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.lg,
            }}
          >
            <div
              style={{
                fontSize: theme.fonts.size.small,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xs,
              }}
            >
              Neue Session:
            </div>
            <div
              style={{
                fontSize: theme.fonts.size.base,
                fontWeight: theme.fonts.weight.medium,
                color: theme.colors.text.primary,
              }}
            >
              📚 {activity?.name} in 📍 {room.name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
          <Button onClick={onCancel} variant="outline" size="large" disabled={isLoading}>
            Abbrechen
          </Button>
          <Button
            onClick={onForceStart}
            variant="primary"
            size="large"
            disabled={isLoading}
            style={{
              backgroundColor: '#dc2626',
              borderColor: '#dc2626',
            }}
          >
            {isLoading ? 'Überschreibe...' : 'Session überschreiben'}
          </Button>
        </div>
      </div>
    </div>
  );
};

function RoomSelectionPage() {
  const {
    authenticatedUser,
    selectedActivity,
    rooms,
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    logout,
  } = useUserStore();

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const navigate = useNavigate();
  const mountedRef = useRef(false);

  // Create logger instance for this component
  const logger = createLogger('RoomSelectionPage');

  // Redirect if missing authentication or selected activity
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

    logger.debug('RoomSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
    });

    return () => {
      logger.debug('RoomSelectionPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, navigate, logger]);

  // Fetch rooms when component mounts
  useEffect(() => {
    if (authenticatedUser && selectedActivity && !mountedRef.current) {
      mountedRef.current = true;
      logger.info('Fetching available rooms');
      void fetchRooms();
    }
  }, [authenticatedUser, selectedActivity, fetchRooms, logger]);

  // Handle room selection
  const handleRoomSelect = (room: Room) => {
    logger.info('Room selected for confirmation', {
      roomId: room.id,
      roomName: room.name,
      activityId: selectedActivity?.id,
    });

    setSelectedRoom(room);
    setShowConfirmModal(true);
  };

  // Handle session start confirmation
  const handleConfirmSession = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);
    try {
      logger.info('Starting activity session', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
        staffId: authenticatedUser.staffId,
      });

      performance.mark('session-start-begin');

      const sessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id, // Manual room selection
      };

      const sessionResponse = await api.startSession(authenticatedUser.pin, sessionRequest);

      performance.mark('session-start-end');
      performance.measure('session-start-duration', 'session-start-begin', 'session-start-end');
      const measure = performance.getEntriesByName('session-start-duration')[0];

      logger.info('Session started successfully', {
        sessionId: sessionResponse.active_group_id,
        activityId: sessionResponse.activity_id,
        deviceId: sessionResponse.device_id,
        duration_ms: measure.duration,
      });

      // Store the selected room
      selectRoom(selectedRoom.id);

      logUserAction('session_started', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        activityName: selectedActivity.name,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      // Navigate to NFC scanning page
      logNavigation('RoomSelectionPage', 'NFC-Scanning', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      void navigate('/nfc-scanning');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Fehler beim Starten der Session';
      logger.error('Session start failed', {
        error: errorMessage,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      logError(
        error instanceof Error ? error : new Error(String(error)),
        'RoomSelectionPage.handleConfirmSession'
      );

      // Handle 409 Conflict - show conflict modal
      logger.debug('Checking for conflict error', { errorMessage, includes409: errorMessage.includes('409'), includesConflict: errorMessage.includes('Conflict') });
      
      if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
        logger.info('Showing conflict modal due to 409 error');
        setShowConflictModal(true);
        setIsStartingSession(false);
        return; // Don't close the confirm modal yet, show conflict modal instead
      } else {
        alert(`Fehler beim Starten der Aktivität: ${errorMessage}`);
        setIsStartingSession(false);
        setShowConfirmModal(false);
        setSelectedRoom(null);
      }
    }
  };

  // Handle force session start from conflict modal
  const handleForceSessionStart = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);
    try {
      logger.info('Retrying session start with force=true', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      const forceSessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id, // Manual room selection
        force: true, // Force override any conflicts
      };

      const sessionResponse = await api.startSession(authenticatedUser.pin, forceSessionRequest);

      logger.info('Session started successfully with force override', {
        sessionId: sessionResponse.active_group_id,
        activityId: sessionResponse.activity_id,
        deviceId: sessionResponse.device_id,
      });

      // Store the selected room
      selectRoom(selectedRoom.id);

      logUserAction('session_started_force', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        activityName: selectedActivity.name,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      // Navigate to NFC scanning page
      logNavigation('RoomSelectionPage', 'NFC-Scanning', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      void navigate('/nfc-scanning');
    } catch (forceError) {
      const forceErrorMessage =
        forceError instanceof Error ? forceError.message : 'Fehler beim Überschreiben der Session';
      logger.error('Force session start also failed', {
        error: forceErrorMessage,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });
      // Could add another error modal here, but for now use alert for force errors
      alert(`Fehler beim Überschreiben der Session: ${forceErrorMessage}`);
    } finally {
      setIsStartingSession(false);
      setShowConfirmModal(false);
      setShowConflictModal(false);
      setSelectedRoom(null);
    }
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
    logger.info('User navigating back to activity selection');
    logNavigation('RoomSelectionPage', 'ActivitySelectionPage', { reason: 'back_button' });
    void navigate('/activity-selection');
  };

  // Handle logout
  const handleLogout = () => {
    try {
      logger.info('User logging out', { user: authenticatedUser?.staffName });
      logUserAction('logout', { username: authenticatedUser?.staffName });
      void logout();
      logNavigation('RoomSelectionPage', 'LoginPage');
      void navigate('/');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'RoomSelectionPage.handleLogout'
      );
    }
  };

  // Room card component
  const RoomCard: React.FC<{ room: Room; onClick: (room: Room) => void }> = ({ room, onClick }) => {
    const cardStyles: React.CSSProperties = {
      backgroundColor: theme.colors.background.light,
      borderRadius: theme.borders.radius.lg,
      padding: theme.spacing.lg,
      cursor: 'pointer',
      transition: theme.animation.transition.fast,
      border: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '180px',
      boxShadow: theme.shadows.sm,
    };

    const getRoomIcon = (roomName: string, roomType?: string) => {
      if (roomType) {
        switch (roomType.toLowerCase()) {
          case 'classroom':
            return '🏫';
          case 'laboratory':
            return '🔬';
          case 'gym':
            return '🏀';
          case 'library':
            return '📚';
          case 'outdoor':
            return '🌳';
          default:
            return '🏢';
        }
      }

      // Fallback to name-based detection
      if (roomName.toLowerCase().includes('toilette')) return '🚻';
      if (roomName.toLowerCase().includes('schulhof')) return '🌳';
      if (roomName.toLowerCase().includes('labor')) return '🔬';
      if (roomName.toLowerCase().includes('sporthalle')) return '🏀';
      return '🏢';
    };

    return (
      <div
        onClick={() => onClick(room)}
        style={cardStyles}
        className="hover:bg-gray-100 hover:shadow-lg active:bg-gray-200"
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>
            {getRoomIcon(room.name, room.room_type)}
          </div>
          <div
            style={{
              fontSize: theme.fonts.size.large,
              fontWeight: theme.fonts.weight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {room.name}
          </div>
        </div>
        <div>
          {room.room_type && (
            <div
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xs,
                textAlign: 'center',
              }}
            >
              🏷️ {room.room_type}
            </div>
          )}
          {room.capacity && (
            <div
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
                textAlign: 'center',
              }}
            >
              👥 Kapazität: {room.capacity}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!authenticatedUser || !selectedActivity) {
    return null; // Will redirect via useEffect
  }

  return (
    <ContentBox centered shadow="md" rounded="lg">
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Fixed Header */}
        <div style={{ flexShrink: 0 }}>
          {/* Navigation buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.spacing.lg,
            }}
          >
            <Button onClick={handleGoBack} variant="outline" size="medium">
              ← Zurück
            </Button>
            <Button onClick={handleLogout} variant="outline" size="small">
              Abmelden
            </Button>
          </div>

          {/* Title and info */}
          <div style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
            <h1
              style={{
                fontSize: theme.fonts.size.xxl,
                fontWeight: theme.fonts.weight.bold,
                marginBottom: theme.spacing.lg,
                color: theme.colors.text.primary,
              }}
            >
              Raum auswählen
            </h1>

            <p
              style={{
                fontSize: theme.fonts.size.large,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.sm,
              }}
            >
              für: {selectedActivity.name}
            </p>

            <p
              style={{
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.secondary,
              }}
            >
              {authenticatedUser.staffName} • {authenticatedUser.deviceName}
            </p>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: theme.spacing.sm }}>
          {/* Loading state */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              <div style={{ fontSize: theme.fonts.size.large, color: theme.colors.text.secondary }}>
                Lade Räume...
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: theme.borders.radius.md,
                padding: theme.spacing.md,
                marginBottom: theme.spacing.lg,
                textAlign: 'center',
                color: '#dc2626',
              }}
            >
              {error}
            </div>
          )}

          {/* Rooms grid */}
          {!isLoading && !error && rooms.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: theme.spacing.md,
                width: '100%',
              }}
            >
              {rooms.map(room => (
                <RoomCard key={room.id} room={room} onClick={handleRoomSelect} />
              ))}
            </div>
          )}

          {/* No rooms state */}
          {!isLoading && !error && rooms.length === 0 && (
            <div style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              <div style={{ fontSize: '4rem', marginBottom: theme.spacing.lg }}>🏢</div>
              <div
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.md,
                }}
              >
                Keine Räume verfügbar
              </div>
              <div
                style={{
                  fontSize: theme.fonts.size.base,
                  color: theme.colors.text.secondary,
                }}
              >
                Es sind derzeit keine Räume für die Auswahl verfügbar.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        activity={selectedActivity}
        room={selectedRoom!}
        onConfirm={handleConfirmSession}
        onCancel={() => {
          setShowConfirmModal(false);
          setSelectedRoom(null);
        }}
        isLoading={isStartingSession}
      />

      {/* Conflict Resolution Modal */}
      <ConflictModal
        isOpen={showConflictModal}
        activity={selectedActivity}
        room={selectedRoom!}
        onForceStart={handleForceSessionStart}
        onCancel={handleConflictCancel}
        isLoading={isStartingSession}
      />
    </ContentBox>
  );
}

export default RoomSelectionPage;
