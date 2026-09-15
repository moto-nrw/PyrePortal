import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, type RfidScanResponse } from './api';
import {
  checkInToDestinationRoom,
  type CheckoutDestinationState,
} from './checkoutDestinationService';

vi.mock('./api', async () => {
  const actual = await vi.importActual('./api');
  return {
    ...actual,
    api: {
      processRfidScan: vi.fn(),
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
