import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  ApiError,
  isWCRoomAlias,
  type OpenRoomMoveResponse,
  type RfidScanResponse,
  type Room,
} from './api';
import {
  checkInToDestinationRoom,
  moveToOpenRoom,
  selectOpenRoomDestinations,
  type CheckoutDestinationState,
} from './checkoutDestinationService';

vi.mock('./api', async () => {
  const actual = await vi.importActual('./api');
  return {
    ...actual,
    api: {
      processRfidScan: vi.fn(),
      moveToOpenRoom: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const makeState = (
  overrides: Partial<CheckoutDestinationState> = {}
): CheckoutDestinationState => ({
  rfid: '04:D6:94:82:97:6A:80',
  studentName: 'Max Mustermann',
  studentId: 42,
  dailyCheckoutAvailable: true,
  showingFarewell: false,
  ...overrides,
});

const serverResult: RfidScanResponse = {
  student_id: 42,
  student_name: 'Max Mustermann',
  action: 'checked_in',
  room_name: 'Schulhof',
};

describe('checkInToDestinationRoom', () => {
  beforeEach(() => {
    mockedApi.processRfidScan.mockReset();
    mockedApi.processRfidScan.mockResolvedValue(serverResult);
  });

  describe('room not configured', () => {
    it('returns the Schulhof error result without calling the server', async () => {
      const result = await checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: null,
        state: makeState(),
        pin: '1234',
      });

      expect(result).toEqual({
        student_name: 'Schulhof nicht verfügbar',
        student_id: 42,
        action: 'error',
        message: 'Max Mustermann: Schulhof-Raum wurde nicht konfiguriert.',
        showAsError: true,
      });
      expect(mockedApi.processRfidScan).not.toHaveBeenCalled();
    });

    it('returns the Toilette error result without calling the server', async () => {
      const result = await checkInToDestinationRoom({
        destination: 'toilette',
        roomId: null,
        state: makeState(),
        pin: '1234',
      });

      expect(result).toEqual({
        student_name: 'Toilette nicht verfügbar',
        student_id: 42,
        action: 'error',
        message: 'Max Mustermann: Toilette-Raum wurde nicht konfiguriert.',
        showAsError: true,
      });
      expect(mockedApi.processRfidScan).not.toHaveBeenCalled();
    });
  });

  describe('successful check-in', () => {
    it('checks into Schulhof and flags the result with isSchulhof', async () => {
      const result = await checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: 9,
        state: makeState(),
        pin: '1234',
        staffId: 7,
      });

      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        {
          student_rfid: '04:D6:94:82:97:6A:80',
          action: 'checkin',
          room_id: 9,
        },
        '1234',
        7
      );
      expect(result).toEqual({
        ...serverResult,
        message: 'Viel Spaß auf dem Schulhof, Max!',
        isSchulhof: true,
      });
    });

    it('checks into Toilette and flags the result with isToilette', async () => {
      const result = await checkInToDestinationRoom({
        destination: 'toilette',
        roomId: 11,
        state: makeState(),
        pin: '1234',
        staffId: 7,
      });

      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        {
          student_rfid: '04:D6:94:82:97:6A:80',
          action: 'checkin',
          room_id: 11,
        },
        '1234',
        7
      );
      expect(result).toEqual({
        ...serverResult,
        message: 'Max geht auf Toilette',
        isToilette: true,
      });
    });
  });

  it('waits for the destination server result before presenting success', async () => {
    let resolveScan!: (result: RfidScanResponse) => void;
    mockedApi.processRfidScan.mockReturnValue(
      new Promise(resolve => {
        resolveScan = resolve;
      })
    );
    const presented = vi.fn();
    const pending = checkInToDestinationRoom({
      destination: 'schulhof',
      roomId: 9,
      state: makeState(),
      pin: '1234',
    }).then(presented);
    await Promise.resolve();
    expect(mockedApi.processRfidScan).toHaveBeenCalledTimes(1);
    expect(presented).not.toHaveBeenCalled();
    resolveScan(serverResult);
    await pending;
    expect(presented).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'checked_in', isSchulhof: true })
    );
  });

  describe('error handling', () => {
    it('maps network errors to the Schulhof network message', async () => {
      mockedApi.processRfidScan.mockRejectedValue(new Error('Failed to fetch'));

      const result = await checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: 9,
        state: makeState(),
        pin: '1234',
      });

      expect(result).toEqual({
        student_name: 'Schulhof Check-in fehlgeschlagen',
        student_id: 42,
        action: 'error',
        message:
          'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
        showAsError: true,
      });
    });

    it('maps network errors to the Toilette network message', async () => {
      mockedApi.processRfidScan.mockRejectedValue(new Error('Failed to fetch'));

      const result = await checkInToDestinationRoom({
        destination: 'toilette',
        roomId: 11,
        state: makeState(),
        pin: '1234',
      });

      expect(result).toEqual({
        student_name: 'Toilette Check-in fehlgeschlagen',
        student_id: 42,
        action: 'error',
        message:
          'Netzwerkfehler bei Toilette-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
        showAsError: true,
      });
    });

    it('maps non-network server errors through mapServerErrorToGerman', async () => {
      mockedApi.processRfidScan.mockRejectedValue(new Error('some unexpected server error'));

      const result = await checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: 9,
        state: makeState(),
        pin: '1234',
      });

      expect(result.action).toBe('error');
      expect(result.showAsError).toBe(true);
      expect(result.student_name).toBe('Schulhof Check-in fehlgeschlagen');
      // mapServerErrorToGerman falls back to a generic German message for unknown errors
      expect(result.message).not.toContain('Netzwerkfehler bei Schulhof-Anmeldung');
    });
  });
});

describe('selectOpenRoomDestinations', () => {
  const rooms: Room[] = [
    { id: 1, name: 'Klassenraum 1a', is_occupied: false },
    { id: 2, name: 'Turnhalle', is_occupied: false, is_open_room: true },
    { id: 3, name: 'Schulhof', is_occupied: false, is_open_room: true, is_schulhof: true },
    { id: 4, name: 'WC', is_occupied: false, is_open_room: true },
    { id: 5, name: 'Bibliothek', is_occupied: true, is_open_room: true },
  ];

  it('offers every released room except the Schulhof, the toilet and the current room', () => {
    expect(selectOpenRoomDestinations(rooms, 5, isWCRoomAlias)).toEqual([
      { id: 2, name: 'Turnhalle' },
    ]);
  });

  it('offers occupied released rooms too', () => {
    expect(selectOpenRoomDestinations(rooms, null, isWCRoomAlias)).toEqual([
      { id: 2, name: 'Turnhalle' },
      { id: 5, name: 'Bibliothek' },
    ]);
  });

  it('offers nothing when an older backend sends no release flag', () => {
    const legacy: Room[] = [{ id: 2, name: 'Turnhalle', is_occupied: false }];
    expect(selectOpenRoomDestinations(legacy, undefined, isWCRoomAlias)).toEqual([]);
  });
});

describe('moveToOpenRoom', () => {
  const room = { id: 77, name: 'Turnhalle' };
  const booked: OpenRoomMoveResponse = {
    student_id: 42,
    student_name: 'Max Mustermann',
    action: 'open_room_stay',
    room_id: 77,
    room_name: 'Turnhalle',
    active_group_id: 250,
    moved: true,
    processed_at: '2026-09-22T10:00:00Z',
    message: 'Max ist jetzt in Turnhalle.',
  };

  beforeEach(() => {
    mockedApi.moveToOpenRoom.mockReset();
    mockedApi.moveToOpenRoom.mockResolvedValue(booked);
  });

  it('books the card into the room and flags the result with isOpenRoom', async () => {
    const result = await moveToOpenRoom({ room, state: makeState(), pin: '1234', staffId: 7 });

    expect(mockedApi.moveToOpenRoom).toHaveBeenCalledWith(
      { student_rfid: '04:D6:94:82:97:6A:80', room_id: 77 },
      '1234',
      7
    );
    expect(result).toEqual({
      student_id: 42,
      student_name: 'Max Mustermann',
      action: 'open_room_stay',
      room_name: 'Turnhalle',
      processed_at: '2026-09-22T10:00:00Z',
      message: 'Max ist jetzt in Turnhalle',
      isOpenRoom: true,
    });
  });

  it('presents a repeated booking as success too', async () => {
    mockedApi.moveToOpenRoom.mockResolvedValue({ ...booked, moved: false });

    const result = await moveToOpenRoom({ room, state: makeState(), pin: '1234' });

    expect(result.isOpenRoom).toBe(true);
    expect(result.showAsError).toBeUndefined();
  });

  it('maps a refusal code to German', async () => {
    mockedApi.moveToOpenRoom.mockRejectedValue(
      new ApiError('API Error: 409 - room is not released', 409, 'room_not_released')
    );

    const result = await moveToOpenRoom({ room, state: makeState(), pin: '1234' });

    expect(result).toEqual({
      student_name: 'Turnhalle: Wechsel fehlgeschlagen',
      student_id: 42,
      action: 'error',
      message: 'Dieser Raum ist gerade nicht offen. Bitte einen anderen Ort wählen.',
      showAsError: true,
    });
  });

  it('keeps the room occupancy of a full room', async () => {
    mockedApi.moveToOpenRoom.mockRejectedValue(
      new ApiError('Room capacity exceeded', 409, 'ROOM_CAPACITY_EXCEEDED', {
        room_id: 77,
        room_name: 'Turnhalle',
        current_occupancy: 20,
        max_capacity: 20,
      })
    );

    const result = await moveToOpenRoom({ room, state: makeState(), pin: '1234' });

    expect(result.message).toBe('Turnhalle ist voll (20/20 Plätze belegt).');
  });

  it('maps network errors to the open-room network message', async () => {
    mockedApi.moveToOpenRoom.mockRejectedValue(new Error('Failed to fetch'));

    const result = await moveToOpenRoom({ room, state: makeState(), pin: '1234' });

    expect(result.message).toBe(
      'Netzwerkfehler beim Raumwechsel. Bitte Verbindung prüfen und erneut scannen.'
    );
    expect(result.showAsError).toBe(true);
  });
});
