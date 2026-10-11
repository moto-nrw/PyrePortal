import { describe, expect, it } from 'vitest';

import {
  ApiError,
  isNetworkRelatedError,
  isNotFoundError,
  mapApiErrorToGerman,
  mapAttendanceErrorToGerman,
  toErrorCode,
} from './apiErrors';
import { ERROR_CODE_CLASSES, ERROR_CODES, LEGACY_ERROR_CODES } from './errorCodes.generated';

// project-phoenix #2504 / PyrePortal #408: the kiosk accepts the renamed
// `bereich.fehlername` codes next to the codes Phoenix sends today.

const CLASS_MESSAGES = {
  input: 'Die Angaben passen nicht. Bitte prüfen und erneut versuchen.',
  permission: 'Das ist hier nicht erlaubt. Bitte an die Leitung wenden.',
  business_rejection: 'Das geht gerade nicht. Bitte eine Betreuungskraft fragen.',
  unavailable: 'moto ist gerade nicht erreichbar. Bitte gleich erneut versuchen.',
  server: 'Das hat leider nicht geklappt. Bitte erneut versuchen.',
} as const;

describe('generated error code list', () => {
  it('holds each code once, in bereich.fehlername form, with a class', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
      expect(Object.keys(CLASS_MESSAGES)).toContain(ERROR_CODE_CLASSES[code]);
    }
  });

  it('maps every legacy code to a code of the list', () => {
    for (const code of Object.values(LEGACY_ERROR_CODES)) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

describe('toErrorCode', () => {
  it('resolves legacy and renamed codes to the same identity', () => {
    expect(toErrorCode('ROOM_CAPACITY_EXCEEDED')).toBe('iot.room_capacity_exceeded');
    expect(toErrorCode('iot.room_capacity_exceeded')).toBe('iot.room_capacity_exceeded');
    expect(toErrorCode('room_not_released')).toBe('rooms.not_released');
    expect(toErrorCode('general.input')).toBe('general.input');
  });

  it('returns undefined for missing and unknown codes', () => {
    expect(toErrorCode(undefined)).toBeUndefined();
    expect(toErrorCode('')).toBeUndefined();
    expect(toErrorCode('iot.not_in_registry')).toBeUndefined();
  });
});

describe('mapApiErrorToGerman with legacy and renamed codes', () => {
  // Every code the kiosk has its own text for, as sent today and after the rename.
  it.each([
    ['ACTIVITY_CAPACITY_EXCEEDED', 'iot.activity_capacity_exceeded', 409],
    ['ROOM_CAPACITY_EXCEEDED', 'iot.room_capacity_exceeded', 409],
    ['STUDENT_ALREADY_ACTIVE', 'iot.student_already_active', 409],
    ['invalid_staff_clock_request', 'iot.invalid_staff_clock_request', 400],
    ['invalid_rfid_tag', 'iot.invalid_rfid_tag', 400],
    ['rfid_tag_not_found', 'iot.rfid_tag_not_found', 404],
    ['rfid_tag_inactive', 'iot.rfid_tag_inactive', 409],
    ['rfid_tag_not_staff', 'iot.rfid_tag_not_staff', 409],
    ['planned_start_not_reached', 'iot.planned_start_not_reached', 409],
    ['deviation_reason_required', 'iot.deviation_reason_required', 409],
    ['invalid_staff_clock_state', 'iot.invalid_staff_clock_state', 409],
    ['room_not_found', 'iot.room_not_found', 404],
    ['room_not_released', 'rooms.not_released', 409],
    ['student_not_present', 'iot.student_not_present', 409],
    ['open_room_binary_mode', 'iot.open_room_binary_mode', 409],
  ])('shows the same text for %s and %s', (legacyCode, newCode, status) => {
    const legacy = mapApiErrorToGerman(new ApiError('opaque', status, legacyCode));
    const renamed = mapApiErrorToGerman(new ApiError('opaque', status, newCode));
    expect(renamed).toBe(legacy);
    expect(Object.values(CLASS_MESSAGES)).not.toContain(renamed);
  });

  it('formats capacity and active-visit details for renamed codes', () => {
    expect(
      mapApiErrorToGerman(
        new ApiError('opaque', 409, 'iot.room_capacity_exceeded', {
          room_name: 'WC',
          current_occupancy: 2,
          max_capacity: 2,
        })
      )
    ).toBe('Toilette ist voll (2/2 Plätze belegt).');
    expect(
      mapApiErrorToGerman(
        new ApiError('opaque', 409, 'iot.activity_capacity_exceeded', {
          activity_name: 'Fußball AG',
          current_occupancy: 20,
          max_capacity: 20,
        })
      )
    ).toBe('Fußball AG ist voll (20/20 Teilnehmer).');
    expect(
      mapApiErrorToGerman(
        new ApiError('opaque', 409, 'iot.student_already_active', { room_name: 'Raum 1A' })
      )
    ).toBe('Schüler*in ist bereits angemeldet in Raum 1A.');
  });
});

describe('mapApiErrorToGerman error class fallback', () => {
  it.each([
    ['general.input', 400, 'input'],
    ['general.permission', 403, 'permission'],
    ['general.business_rejection', 409, 'business_rejection'],
    ['general.unavailable', 503, 'unavailable'],
    ['general.server', 500, 'server'],
  ] as const)('shows the class text for %s', (code, status, errorClass) => {
    const message = `API Error: ${status} - Status: something the kiosk does not know`;
    expect(mapApiErrorToGerman(new ApiError(message, status, code))).toBe(
      CLASS_MESSAGES[errorClass]
    );
  });

  it('uses the registry class of a known code without kiosk text', () => {
    // Both are business rejections in the registry, whatever the status says.
    expect(
      mapApiErrorToGerman(new ApiError('API Error: 409 - x', 409, 'enrollment.window_closed'))
    ).toBe(CLASS_MESSAGES.business_rejection);
    expect(
      mapApiErrorToGerman(
        new ApiError('API Error: 400 - x', 400, 'students.guardian_access_revoked')
      )
    ).toBe(CLASS_MESSAGES.business_rejection);
  });

  it.each([
    [400, 'input'],
    [404, 'input'],
    [401, 'permission'],
    [403, 'permission'],
    [409, 'business_rejection'],
    [422, 'business_rejection'],
    [429, 'unavailable'],
    [503, 'unavailable'],
    [500, 'server'],
  ] as const)('derives the class of an unknown code from HTTP %i', (status, errorClass) => {
    const error = new ApiError(`API Error: ${status} - x: unknown`, status, 'iot.not_in_registry');
    expect(mapApiErrorToGerman(error)).toBe(CLASS_MESSAGES[errorClass]);
  });

  it('never shows the English backend text of an unmatched error', () => {
    const error = new ApiError('API Error: 422 - Unprocessable Entity: some detail', 422);
    expect(mapApiErrorToGerman(error)).toBe(CLASS_MESSAGES.business_rejection);
  });

  it('shows the message of plain errors unchanged', () => {
    expect(mapApiErrorToGerman(new Error('Zeitüberschreitung. Server antwortet nicht.'))).toBe(
      'Zeitüberschreitung. Server antwortet nicht.'
    );
  });
});

describe('mapAttendanceErrorToGerman with ApiError', () => {
  it('shows the kiosk text of a renamed code', () => {
    expect(
      mapAttendanceErrorToGerman(new ApiError('opaque', 409, 'iot.student_not_present'), 'toggle')
    ).toBe('Das Kind ist heute noch nicht angemeldet. Bitte eine Betreuungskraft fragen.');
  });

  it('keeps the context text for 404 and 403', () => {
    expect(
      mapAttendanceErrorToGerman(
        new ApiError('API Error: 404 - Not Found: x', 404, 'general.input'),
        'toggle'
      )
    ).toBe('Schüler nicht gefunden. RFID-Tag möglicherweise nicht zugewiesen.');
    expect(
      mapAttendanceErrorToGerman(
        new ApiError('API Error: 403 - Forbidden: x', 403, 'general.permission'),
        'toggle'
      )
    ).toBe('Keine Berechtigung für An-/Abmeldung dieses Schülers.');
  });

  it('falls back to the class text otherwise', () => {
    expect(
      mapAttendanceErrorToGerman(
        new ApiError('API Error: 500 - Internal Server Error: x', 500, 'general.server'),
        'toggle'
      )
    ).toBe(CLASS_MESSAGES.server);
  });
});

// project-phoenix #3939 / PyrePortal #409: the kiosk errors that had no code
// of their own carry an iot.* code now. The kiosk shows its text by code only.
describe('kiosk error codes from project-phoenix #3939', () => {
  it.each([
    [
      'iot.device_api_key_required',
      401,
      'API-Schlüssel nicht konfiguriert. Bitte .env Datei prüfen.',
    ],
    [
      'iot.device_api_key_format_invalid',
      401,
      'API-Schlüssel Format ungültig. Bearer Token erwartet.',
    ],
    [
      'iot.device_api_key_invalid',
      401,
      'API-Schlüssel ungültig. Bitte Geräte-Konfiguration prüfen.',
    ],
    ['iot.device_pin_required', 401, 'PIN nicht angegeben.'],
    ['iot.device_pin_invalid', 401, 'Ungültiger PIN. Bitte erneut versuchen.'],
    ['iot.device_inactive', 403, 'Gerät ist deaktiviert. Bitte Administrator kontaktieren.'],
    ['iot.rfid_tag_unassigned', 404, 'Armband ist nicht zugewiesen. Bitte an die Leitung wenden.'],
    [
      'iot.rfid_tag_not_student_or_staff',
      404,
      'Armband ist nicht zugewiesen. Bitte an die Leitung wenden.',
    ],
    ['iot.person_not_student', 404, 'Person ist kein Schüler.'],
    ['iot.pickup_student_rfid_required', 400, 'Bitte Schüler-Armband scannen.'],
    ['iot.no_active_session', 404, 'Keine aktive Sitzung. Bitte zuerst eine Aktivität starten.'],
    ['iot.no_session_to_end', 400, 'Keine aktive Sitzung zum Beenden vorhanden.'],
    ['iot.no_active_groups_in_room', 404, 'Keine aktiven Gruppen im ausgewählten Raum.'],
    [
      'iot.no_room_available',
      400,
      'Für diese Aktivität fehlt ein Raum. Bitte einen Raum auswählen.',
    ],
    ['iot.no_attendance_record_today', 404, 'Schüler wurde heute noch nicht eingecheckt.'],
    [
      'iot.schulhof_not_configured',
      500,
      'Schulhof-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
    ],
    [
      'iot.wc_not_configured',
      500,
      'Toilette-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
    ],
    [
      'iot.wc_needs_staff',
      500,
      'Toilette-Aktivität konnte nicht erstellt werden. Bitte zuerst Betreuer-RFID scannen.',
    ],
    ['iot.staff_not_found', 404, 'Mitarbeiter nicht gefunden.'],
    ['iot.staff_rfid_tag_unassigned', 404, 'Mitarbeiter hat kein Armband zugewiesen.'],
  ] as const)('shows the kiosk text for %s', (code, status, text) => {
    expect(mapApiErrorToGerman(new ApiError('opaque', status, code))).toBe(text);
  });

  it('ignores the backend text of an error without a kiosk code', () => {
    const error = new ApiError(
      'API Error: 401 - Unauthorized: invalid staff PIN',
      401,
      'general.permission'
    );
    expect(mapApiErrorToGerman(error)).toBe(CLASS_MESSAGES.permission);
  });

  it('ignores the backend text in the attendance mapping', () => {
    const error = new ApiError(
      'API Error: 404 - Not Found: student has no attendance record for today',
      404,
      'iot.no_attendance_record_today'
    );
    expect(mapAttendanceErrorToGerman(error, 'toggle')).toBe(
      'Schüler wurde heute noch nicht eingecheckt.'
    );
    const withoutCode = new ApiError('API Error: 404 - Not Found: RFID tag not found', 404);
    expect(mapAttendanceErrorToGerman(withoutCode, 'feedback')).toBe(
      'Feedback-Service nicht erreichbar. Bitte später versuchen.'
    );
  });

  it('decides the attendance context text by status, not by message', () => {
    const forbidden = new ApiError('opaque', 403, 'general.permission');
    expect(mapAttendanceErrorToGerman(forbidden, 'feedback')).toBe(
      'Keine Berechtigung für Feedback-Übermittlung.'
    );
    const notFoundText = new ApiError('API Error: 409 - Conflict: not found', 409);
    expect(mapAttendanceErrorToGerman(notFoundText, 'toggle')).toBe(
      CLASS_MESSAGES.business_rejection
    );
  });

  it('never treats an answer of the server as a network error', () => {
    const error = new ApiError(
      'API Error: 500 - Internal Server Error: connection to database failed',
      500,
      'general.server'
    );
    expect(isNetworkRelatedError(error)).toBe(false);
  });

  it('detects a 404 by status only', () => {
    expect(isNotFoundError(new ApiError('opaque', 404, 'iot.rfid_tag_not_found'))).toBe(true);
    expect(isNotFoundError(new ApiError('API Error: 404 - x', 409))).toBe(false);
  });
});
