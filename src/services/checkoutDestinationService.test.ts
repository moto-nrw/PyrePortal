import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecentTagScan } from '../store/slices/scanSlice';

import { api, type RfidScanResult } from './api';
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

const serverResult: RfidScanResult = {
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
        recentTagScans: new Map(),
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
        recentTagScans: new Map(),
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
        recentTagScans: new Map(),
      });

      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        {
          student_rfid: '04:D6:94:82:97:6A:80',
          action: 'checkin',
          room_id: 9,
        },
        '1234'
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
        recentTagScans: new Map(),
      });

      expect(mockedApi.processRfidScan).toHaveBeenCalledWith(
        {
          student_rfid: '04:D6:94:82:97:6A:80',
          action: 'checkin',
          room_id: 11,
        },
        '1234'
      );
      expect(result).toEqual({
        ...serverResult,
        message: 'Max geht auf Toilette',
        isToilette: true,
      });
    });
  });

  describe('background checkout sync race handling', () => {
    it('waits for the pending sync promise before checking in', async () => {
      const callOrder: string[] = [];
      let resolveSync!: () => void;
      const syncPromise = new Promise<void>(resolve => {
        resolveSync = () => {
          callOrder.push('sync-resolved');
          resolve();
        };
      });
      mockedApi.processRfidScan.mockImplementation(() => {
        callOrder.push('processRfidScan');
        return Promise.resolve(serverResult);
      });

      const recentTagScans = new Map<string, RecentTagScan>([
        ['04:D6:94:82:97:6A:80', { timestamp: Date.now(), syncPromise }],
      ]);

      const pending = checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: 9,
        state: makeState(),
        pin: '1234',
        recentTagScans,
      });

      // Give the service a chance to (incorrectly) call the server early
      await Promise.resolve();
      expect(mockedApi.processRfidScan).not.toHaveBeenCalled();

      resolveSync();
      await pending;

      expect(callOrder).toEqual(['sync-resolved', 'processRfidScan']);
    });

    it('proceeds directly when no sync promise is pending for the tag', async () => {
      const recentTagScans = new Map<string, RecentTagScan>([
        ['04:D6:94:82:97:6A:80', { timestamp: Date.now() }],
      ]);

      await checkInToDestinationRoom({
        destination: 'toilette',
        roomId: 11,
        state: makeState(),
        pin: '1234',
        recentTagScans,
      });

      expect(mockedApi.processRfidScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('maps network errors to the Schulhof network message', async () => {
      mockedApi.processRfidScan.mockRejectedValue(new Error('Failed to fetch'));

      const result = await checkInToDestinationRoom({
        destination: 'schulhof',
        roomId: 9,
        state: makeState(),
        pin: '1234',
        recentTagScans: new Map(),
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
        recentTagScans: new Map(),
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
        recentTagScans: new Map(),
      });

      expect(result.action).toBe('error');
      expect(result.showAsError).toBe(true);
      expect(result.student_name).toBe('Schulhof Check-in fehlgeschlagen');
      // mapServerErrorToGerman falls back to a generic German message for unknown errors
      expect(result.message).not.toContain('Netzwerkfehler bei Schulhof-Anmeldung');
    });
  });
});
