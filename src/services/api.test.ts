import { describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  formatRoomName,
  isNetworkRelatedError,
  mapApiErrorToGerman,
  mapServerErrorToGerman,
  setNetworkStatusCallback,
} from './api';

// ====================================================================
// ApiError class
// ====================================================================

describe('ApiError', () => {
  it('creates error with all fields', () => {
    const error = new ApiError('test message', 401, 'AUTH_FAILED', { room_id: 1 });
    expect(error.message).toBe('test message');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTH_FAILED');
    expect(error.details).toEqual({ room_id: 1 });
    expect(error.name).toBe('ApiError');
    expect(error).toBeInstanceOf(Error);
  });

  it('creates error without optional fields', () => {
    const error = new ApiError('basic error', 500);
    expect(error.code).toBeUndefined();
    expect(error.details).toBeUndefined();
    expect(error.statusCode).toBe(500);
  });
});

// ====================================================================
// mapServerErrorToGerman — error message mapping
// ====================================================================

describe('mapServerErrorToGerman', () => {
  // Authentication errors
  it('maps invalid device API key', () => {
    expect(mapServerErrorToGerman('invalid device API key')).toBe(
      'API-Schlüssel ungültig. Bitte Geräte-Konfiguration prüfen.'
    );
  });

  it('maps invalid staff PIN', () => {
    expect(mapServerErrorToGerman('invalid staff PIN')).toBe(
      'Ungültiger PIN. Bitte erneut versuchen.'
    );
  });

  it('maps locked account', () => {
    expect(mapServerErrorToGerman('staff account is locked due to failed PIN attempts')).toBe(
      'Konto gesperrt wegen zu vieler Fehlversuche. Bitte Administrator kontaktieren.'
    );
  });

  it('maps maximum PIN attempts', () => {
    expect(mapServerErrorToGerman('maximum PIN attempts exceeded')).toBe(
      'Maximale PIN-Versuche überschritten. Konto gesperrt.'
    );
  });

  it('maps generic locked', () => {
    expect(mapServerErrorToGerman('locked')).toBe('Konto gesperrt. Bitte später erneut versuchen.');
  });

  // Capacity errors
  it('maps activity capacity exceeded', () => {
    expect(mapServerErrorToGerman('ACTIVITY_CAPACITY_EXCEEDED')).toBe(
      'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.'
    );
  });

  it('maps activity capacity exceeded lowercase', () => {
    expect(mapServerErrorToGerman('activity capacity exceeded')).toBe(
      'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.'
    );
  });

  it('maps room capacity exceeded', () => {
    expect(mapServerErrorToGerman('ROOM_CAPACITY_EXCEEDED')).toBe(
      'Raum ist voll. Kein Platz mehr verfügbar.'
    );
  });

  // Device errors
  it('maps device not active', () => {
    expect(mapServerErrorToGerman('device is not active')).toBe(
      'Gerät ist deaktiviert. Bitte Administrator kontaktieren.'
    );
  });

  // Session errors
  it('maps already running session', () => {
    expect(mapServerErrorToGerman('device is already running an activity session')).toBe(
      'Gerät führt bereits eine Aktivität durch. Bitte zuerst beenden.'
    );
  });

  it('maps no active session to end', () => {
    expect(mapServerErrorToGerman('no active session to end')).toBe(
      'Keine aktive Sitzung zum Beenden vorhanden.'
    );
  });

  // RFID errors
  it('maps RFID tag not found', () => {
    expect(mapServerErrorToGerman('RFID tag not found')).toBe(
      'Armband ist nicht zugewiesen. Bitte an Betreuer wenden.'
    );
  });

  it('maps RFID tag not assigned', () => {
    expect(mapServerErrorToGerman('RFID tag not assigned')).toBe(
      'Armband ist nicht zugewiesen. Bitte an Betreuer wenden.'
    );
  });

  it('maps staff RFID auth error', () => {
    expect(
      mapServerErrorToGerman('staff RFID authentication must be done via session management')
    ).toBe('Betreuer-Armband kann hier nicht verwendet werden.');
  });

  // Internal server errors
  it('maps schulhof not configured', () => {
    expect(mapServerErrorToGerman('schulhof activity not configured')).toBe(
      'Schulhof-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.'
    );
  });

  it('maps WC not configured', () => {
    expect(mapServerErrorToGerman('WC activity not configured')).toBe(
      'Toilette-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.'
    );
  });

  it('maps failed to create session (generic)', () => {
    expect(mapServerErrorToGerman('failed to create session')).toBe(
      'Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.'
    );
  });

  it('maps failed to create Schulhof session (specific before generic)', () => {
    expect(mapServerErrorToGerman('failed to create Schulhof session')).toBe(
      'Schulhof-Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.'
    );
  });

  it('maps failed to create WC session (specific before generic)', () => {
    expect(mapServerErrorToGerman('failed to create WC session')).toBe(
      'Toilette-Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.'
    );
  });

  // HTTP status code fallbacks
  it('maps 401/Unauthorized', () => {
    expect(mapServerErrorToGerman('401')).toBe(
      'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.'
    );
  });

  it('maps 404/Not Found', () => {
    expect(mapServerErrorToGerman('Not Found')).toBe(
      'Ressource nicht gefunden. Bitte Konfiguration prüfen.'
    );
  });

  it('maps 500 server error', () => {
    expect(mapServerErrorToGerman('Internal Server Error')).toBe(
      'Server nicht erreichbar. Bitte später versuchen.'
    );
  });

  it('maps 502 Bad Gateway', () => {
    expect(mapServerErrorToGerman('Bad Gateway')).toBe(
      'Server nicht erreichbar. Bitte später versuchen.'
    );
  });

  // Fallback
  it('returns original for unknown errors', () => {
    expect(mapServerErrorToGerman('something completely unknown happened')).toBe(
      'something completely unknown happened'
    );
  });

  // Pattern matching specificity
  it('matches substring patterns', () => {
    expect(mapServerErrorToGerman('API Error: 404 - RFID tag not found for tag XYZ')).toBe(
      'Armband ist nicht zugewiesen. Bitte an Betreuer wenden.'
    );
  });

  // Validation errors
  it('maps activity_id required', () => {
    expect(mapServerErrorToGerman('activity_id is required')).toBe(
      'Aktivität muss ausgewählt werden.'
    );
  });

  it('maps supervisor required', () => {
    expect(mapServerErrorToGerman('at least one supervisor')).toBe(
      'Mindestens ein Betreuer muss ausgewählt werden.'
    );
  });

  it('maps destination validation', () => {
    expect(mapServerErrorToGerman("destination must be 'zuhause' or 'unterwegs'")).toBe(
      "Ziel muss 'zuhause' oder 'unterwegs' sein."
    );
  });
});

// ====================================================================
// mapApiErrorToGerman — structured error mapping
// ====================================================================

describe('mapApiErrorToGerman', () => {
  it('handles non-Error values', () => {
    expect(mapApiErrorToGerman('some string error')).toBe('some string error');
  });

  it('handles regular Error', () => {
    expect(mapApiErrorToGerman(new Error('invalid staff PIN'))).toBe(
      'Ungültiger PIN. Bitte erneut versuchen.'
    );
  });

  it('handles ApiError with activity capacity details', () => {
    const error = new ApiError('Activity capacity exceeded', 409, 'ACTIVITY_CAPACITY_EXCEEDED', {
      activity_name: 'Fußball AG',
      current_participants: 20,
      max_participants: 20,
    });
    const result = mapApiErrorToGerman(error);
    expect(result).toBe('Fußball AG ist voll (20/20 Teilnehmer).');
  });

  it('handles ApiError with room capacity details', () => {
    const error = new ApiError('Room capacity exceeded', 409, 'ROOM_CAPACITY_EXCEEDED', {
      room_name: 'Turnhalle',
      current_occupancy: 30,
      max_capacity: 30,
    });
    const result = mapApiErrorToGerman(error);
    expect(result).toBe('Turnhalle ist voll (30/30 Plätze belegt).');
  });

  it('handles room capacity with WC name mapping', () => {
    const error = new ApiError('Room capacity exceeded', 409, 'ROOM_CAPACITY_EXCEEDED', {
      room_name: 'WC',
      current_occupancy: 2,
      max_capacity: 2,
    });
    expect(mapApiErrorToGerman(error)).toBe('Toilette ist voll (2/2 Plätze belegt).');
  });

  it('handles activity capacity without details falls back to message mapping', () => {
    const error = new ApiError('ACTIVITY_CAPACITY_EXCEEDED', 409, 'ACTIVITY_CAPACITY_EXCEEDED');
    // No details → falls through to mapServerErrorToGerman(error.message)
    expect(mapApiErrorToGerman(error)).toBe(
      'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.'
    );
  });

  it('handles activity capacity with partial details', () => {
    const error = new ApiError('capacity', 409, 'ACTIVITY_CAPACITY_EXCEEDED', {
      activity_name: 'Kunst',
      max_participants: 15,
    });
    expect(mapApiErrorToGerman(error)).toBe('Kunst ist voll (15/15 Teilnehmer).');
  });

  it('handles room capacity without current occupancy', () => {
    const error = new ApiError('capacity', 409, 'ROOM_CAPACITY_EXCEEDED', {
      room_name: 'Raum A',
      max_capacity: 25,
    });
    expect(mapApiErrorToGerman(error)).toBe('Raum A ist voll (25/25 Plätze belegt).');
  });

  it('falls back to message mapping for other ApiErrors', () => {
    const error = new ApiError('invalid staff PIN', 401);
    expect(mapApiErrorToGerman(error)).toBe('Ungültiger PIN. Bitte erneut versuchen.');
  });
});

// ====================================================================
// formatRoomName
// ====================================================================

describe('formatRoomName', () => {
  it('maps WC to Toilette', () => {
    expect(formatRoomName('WC')).toBe('Toilette');
  });

  it('keeps other names unchanged', () => {
    expect(formatRoomName('Turnhalle')).toBe('Turnhalle');
    expect(formatRoomName('Raum 101')).toBe('Raum 101');
    expect(formatRoomName('Schulhof')).toBe('Schulhof');
  });
});

// ====================================================================
// isNetworkRelatedError
// ====================================================================

describe('isNetworkRelatedError', () => {
  it('detects network keyword', () => {
    expect(isNetworkRelatedError(new Error('NetworkError when attempting to fetch'))).toBe(true);
  });

  it('detects fetch error', () => {
    expect(isNetworkRelatedError(new Error('Failed to fetch'))).toBe(true);
  });

  it('detects timeout', () => {
    expect(isNetworkRelatedError(new Error('Request timed out'))).toBe(true);
  });

  it('detects connection error', () => {
    expect(isNetworkRelatedError(new Error('Connection refused'))).toBe(true);
  });

  it('detects offline', () => {
    expect(isNetworkRelatedError(new Error('Device is offline'))).toBe(true);
  });

  it('detects German network words', () => {
    expect(isNetworkRelatedError('Netzwerk nicht verfügbar')).toBe(true);
    expect(isNetworkRelatedError('Verbindung fehlgeschlagen')).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isNetworkRelatedError(new Error('Invalid PIN'))).toBe(false);
    expect(isNetworkRelatedError(new Error('Not found'))).toBe(false);
  });

  it('handles string input', () => {
    expect(isNetworkRelatedError('failed to fetch data')).toBe(true);
  });

  it('detects navigator.onLine false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(isNetworkRelatedError(new Error('anything'))).toBe(true);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

// ====================================================================
// setNetworkStatusCallback
// ====================================================================

describe('setNetworkStatusCallback', () => {
  it('accepts a callback', () => {
    const cb = vi.fn();
    setNetworkStatusCallback(cb);
    // No assertion needed — just verifying it doesn't throw
    setNetworkStatusCallback(null); // cleanup
  });

  it('accepts null to clear callback', () => {
    setNetworkStatusCallback(null);
  });
});
