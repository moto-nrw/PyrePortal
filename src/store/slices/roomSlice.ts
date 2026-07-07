import { api, mapServerErrorToGerman, type Room } from '../../services/api';
import { createLogger } from '../../utils/logger';
import type { GetState, SetState, UserState } from '../userStore';

// Create a store-specific logger instance
const storeLogger = createLogger('UserStore');

export const createRoomSlice = (set: SetState<UserState>, get: GetState<UserState>) => ({
  // Initial state
  rooms: [] as Room[],
  selectedRoom: null,
  _roomSelectedAt: null,

  fetchRooms: async () => {
    const { authenticatedUser } = get();

    if (!authenticatedUser?.pin) {
      const errorMsg = 'Keine Authentifizierung für das Laden von Räumen';
      storeLogger.warn('Cannot fetch rooms: no authenticated user or PIN');
      set({ error: mapServerErrorToGerman(errorMsg), isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      storeLogger.info('Fetching available rooms from API', {
        staffId: authenticatedUser.staffId,
        staffName: authenticatedUser.staffName,
      });

      const rooms = await api.getRooms(authenticatedUser.pin);

      storeLogger.debug('Available rooms fetched successfully', { count: rooms.length });
      set({ rooms, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Laden der Räume';
      storeLogger.error('Failed to fetch available rooms', { error: errorMessage });
      set({ error: mapServerErrorToGerman(errorMessage), isLoading: false });
    }
  },

  // Store the selected room
  selectRoom: (roomId: number) => {
    const { rooms } = get();
    const roomToSelect = rooms.find(r => r.id === roomId);

    if (roomToSelect) {
      storeLogger.info('Room selected', { roomId, roomName: roomToSelect.name });
      set({ selectedRoom: roomToSelect, _roomSelectedAt: Date.now() });
    } else {
      storeLogger.warn('Room not found', { roomId });
    }
  },
});
