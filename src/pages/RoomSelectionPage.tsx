import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function RoomSelectionPage() {
  const {
    selectedUser,
    rooms,
    // Removing selectedRoom since it's not used in this component
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    logout,
  } = useUserStore();

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const initialLoadRef = useRef(false);

  // Create logger instance for this component
  const logger = createLogger('RoomSelectionPage');

  // Log component initial render
  useEffect(() => {
    logger.debug('RoomSelectionPage component mounted', { user: selectedUser });

    // Validate authentication
    if (!selectedUser) {
      logger.warn('Unauthenticated access to RoomSelectionPage');
    }

    return () => {
      logger.debug('RoomSelectionPage component unmounted');
    };
  }, [selectedUser, logger]);

  // Fetch rooms when component mounts (once)
  useEffect(() => {
    if (!initialLoadRef.current) {
      logger.info('Fetching available rooms', { user: selectedUser });
      performance.mark('room-fetch-start');

      fetchRooms()
        .then(() => {
          performance.mark('room-fetch-end');
          performance.measure('room-fetch-duration', 'room-fetch-start', 'room-fetch-end');

          const measure = performance.getEntriesByName('room-fetch-duration')[0];
          logger.debug('Room fetch completed', {
            duration_ms: measure.duration,
            roomCount: rooms.length,
          });
        })
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error('Room fetch failed', { error: errorMsg });
        });

      initialLoadRef.current = true;
    }
  }, [fetchRooms, selectedUser, rooms.length, logger]);

  // Handle room selection and directly move to activity creation
  const handleRoomSelection = async (roomId: number) => {
    try {
      const room = rooms.find(r => r.id === roomId);
      logger.debug('Room selection initiated', {
        roomId,
        roomName: room?.name,
        isOccupied: room?.isOccupied,
      });

      if (room?.isOccupied) {
        const message = `${room.name} ist bereits von ${room.occupiedBy} belegt.`;
        setSelectionMessage(message);
        logger.warn('Occupied room selection attempted', {
          roomId,
          roomName: room.name,
          occupiedBy: room.occupiedBy,
        });
        logUserAction('room_selection_failed', {
          reason: 'room_occupied',
          roomId,
          roomName: room.name,
          occupiedBy: room.occupiedBy,
        });
        return;
      }

      // Update UI to show which room is selected
      setSelectedRoomId(roomId);
      setSelectionMessage(null);

      // Track room selection performance
      performance.mark('room-selection-start');

      // Immediately select the room (no need for confirmation button)
      const success = await selectRoom(roomId);

      performance.mark('room-selection-end');
      performance.measure('room-selection-duration', 'room-selection-start', 'room-selection-end');
      const measure = performance.getEntriesByName('room-selection-duration')[0];

      if (success) {
        // Room selection was successful, redirect to create activity
        logger.info('Room selected successfully', {
          roomId,
          roomName: room?.name,
          selectionTime_ms: measure.duration,
        });

        logUserAction('room_selected', {
          roomId,
          roomName: room?.name,
        });
        logNavigation('RoomSelectionPage', 'CreateActivityPage', { roomId });
        void navigate('/create-activity');
      } else {
        const errorMessage = 'Fehler bei der Raumauswahl. Bitte versuche es erneut.';
        setSelectionMessage(errorMessage);
        logger.error('Room selection failed', {
          roomId,
          roomName: room?.name,
          selectionTime_ms: measure.duration,
        });
        logUserAction('room_selection_failed', {
          reason: 'api_error',
          roomId,
          roomName: room?.name,
        });
      }
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'RoomSelectionPage.handleRoomSelection'
      );
      setSelectionMessage('Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
    }
  };

  // Handle logout
  const handleLogout = () => {
    try {
      logger.info('User logging out', { user: selectedUser });
      logUserAction('logout', { username: selectedUser });
      logout();
      logNavigation('RoomSelectionPage', 'LoginPage');
      void navigate('/');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'RoomSelectionPage.handleLogout'
      );
    }
  };

  // Room item component
  const RoomItem = ({ room }: { room: (typeof rooms)[0] }) => {
    const isSelected = selectedRoomId === room.id;

    return (
      <div
        onClick={() => handleRoomSelection(room.id)}
        className={`mb-3 cursor-pointer rounded-lg border-2 p-4 transition-all ${isSelected ? 'border-[#24c8db] bg-[rgba(36,200,219,0.1)]' : 'border-gray-200'} ${room.isOccupied ? 'bg-gray-100' : 'hover:border-[#24c8db] hover:bg-[rgba(36,200,219,0.05)]'} `}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: theme.shadows.sm,
        }}
      >
        <div className="flex items-center">
          <div className="mr-4">
            {room.isOccupied ? (
              <img src="/img/checked_in.png" alt="Belegt" width={32} height={32} />
            ) : (
              <img src="/img/checked_out.png" alt="Frei" width={32} height={32} />
            )}
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold">{room.name}</h3>
            {room.isOccupied && (
              <p className="text-sm text-gray-600">Belegt von: {room.occupiedBy}</p>
            )}
          </div>
        </div>

        {/* Show room type icon */}
        <div className="ml-2 flex-shrink-0">
          {room.name.includes('Toilette') && (
            <img src="/img/toilet_icon.png" alt="Toilette" width={24} height={24} />
          )}
          {room.name.includes('Schulhof') && (
            <img src="/img/school_yard_icon.png" alt="Schulhof" width={24} height={24} />
          )}
        </div>
      </div>
    );
  };

  return (
    <ContentBox shadow="md" rounded="lg" height="95%" className="overflow-auto" centered={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1
            style={{
              fontSize: theme.fonts.size.xl,
              fontWeight: theme.fonts.weight.bold,
            }}
          >
            Raumauswahl
          </h1>
          <div className="flex items-center">
            <p className="mr-3 font-medium text-[#396cd8]">{selectedUser}</p>
            <div className="flex gap-2">
              <Button onClick={handleLogout} variant="outline" size="small">
                Abmelden
              </Button>
            </div>
          </div>
        </div>

        {/* Status message */}
        {selectionMessage && (
          <div
            className={`mb-6 rounded-md p-3 text-center ${
              selectionMessage.includes('erfolgreich')
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {selectionMessage}
          </div>
        )}

        {/* Instructions */}
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-blue-800">
            Wähle einen freien Raum aus, um dort eine Aktivität zu erstellen.
          </p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="py-8 text-center">
            <p className="mb-2 text-gray-500">Lade Räume...</p>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#24c8db] border-t-transparent"></div>
            {/* Logging loading state */}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="py-8 text-center text-red-600">
            <p>{error}</p>
            <Button
              onClick={() => {
                logger.info('Retrying room fetch after error');
                void fetchRooms();
              }}
              variant="secondary"
              size="small"
              className="mt-4"
            >
              Erneut versuchen
            </Button>
            {/* Logging error state */}
          </div>
        )}

        {/* Rooms list */}
        {!isLoading && !error && rooms.length > 0 && (
          <div className="space-y-2">
            {rooms.map(room => (
              <RoomItem key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>
    </ContentBox>
  );
}

export default RoomSelectionPage;
