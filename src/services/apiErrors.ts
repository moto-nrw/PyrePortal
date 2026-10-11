/**
 * Error mapping for the PyrePortal API layer.
 * Maps backend error codes to German UI messages (contract with
 * project-phoenix). The kiosk never reads the text of a backend error.
 */

import {
  ERROR_CODE_CLASSES,
  ERROR_CODES,
  LEGACY_ERROR_CODES,
  type ErrorClass,
  type ErrorCode,
} from './errorCodes.generated';

/**
 * Structured API error response with optional details
 * Used for rich error responses like capacity exceeded
 */
export interface ApiErrorResponse {
  status: string;
  message: string;
  code?: string;
  details?: {
    // Capacity fields — the backend sends current_occupancy/max_capacity for
    // BOTH room and activity capacity errors (project-phoenix issue #1879)
    room_id?: number;
    room_name?: string;
    current_occupancy?: number;
    max_capacity?: number;
    // Activity capacity fields
    activity_id?: number;
    activity_name?: string;
    // Duplicate-active-visit fields (Issue #844, backend STUDENT_ALREADY_ACTIVE)
    student_id?: number;
    existing_visit_id?: number;
    entry_time?: string;
    // Staff clock conflict fields (project-phoenix #1654). The backend sends
    // more of them; only the two the kiosk renders are declared.
    planned_start_time?: string;
    deviation_minutes?: string;
  };
}

/**
 * Custom error class that preserves structured API error data
 */
export class ApiError extends Error {
  public readonly code?: string;
  public readonly details?: ApiErrorResponse['details'];
  public readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    details?: ApiErrorResponse['details']
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Type guard to check if value is a string or number */
function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Canonical names a backend toilet special-room can come back with, in
 * canonical-first order. The first entry is what Phoenix auto-creates;
 * the second is an accepted alias a tenant may have created manually.
 *
 * Must stay in sync with Phoenix backend/constants/activities.go
 * (WCRoomName, WCRoomAliasName) and frontend/src/lib/room-helpers.ts
 * (SYSTEM_ROOM_NAMES). Matching is exact-case to mirror the backend's
 * `IsWCRoomName` check. Adding a new alias requires updating all three.
 */
export const WC_ROOM_ALIASES = ['WC', 'Toilette'] as const;

/**
 * Returns true when the given room name is one of the toilet aliases.
 * Only used internally; exported as a test seam for api.test.ts.
 */
export function isWCRoomAlias(name: string): boolean {
  return (WC_ROOM_ALIASES as readonly string[]).includes(name);
}

/**
 * Map backend room names to German display names.
 * Any toilet-room alias is shown as "Toilette" in the kiosk UI.
 */
export function formatRoomName(name: string): string {
  if (isWCRoomAlias(name)) return 'Toilette';
  return name;
}

/**
 * Format activity capacity error message from details
 */
function formatActivityCapacityError(details: Record<string, unknown>): string {
  const activityName = details.activity_name;
  const currentOccupancy = details.current_occupancy;
  const maxCapacity = details.max_capacity;

  if (isStringOrNumber(activityName) && isStringOrNumber(maxCapacity)) {
    const current = isStringOrNumber(currentOccupancy) ? currentOccupancy : maxCapacity;
    return `${activityName} ist voll (${current}/${maxCapacity} Teilnehmer).`;
  }
  return 'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.';
}

/**
 * Format room capacity error message from details
 */
function formatRoomCapacityError(details: Record<string, unknown>): string {
  const roomName = details.room_name;
  const currentOccupancy = details.current_occupancy;
  const maxCapacity = details.max_capacity;

  if (isStringOrNumber(roomName) && isStringOrNumber(maxCapacity)) {
    const current = isStringOrNumber(currentOccupancy) ? currentOccupancy : maxCapacity;
    const displayName = typeof roomName === 'string' ? formatRoomName(roomName) : roomName;
    return `${displayName} ist voll (${current}/${maxCapacity} Plätze belegt).`;
  }
  return 'Raum ist voll. Kein Platz mehr verfügbar.';
}

/**
 * Format duplicate-active-visit error message from details
 * Backend (Issue #844) returns the existing visit's room so the kiosk can
 * tell the user which room the student is already checked into rather than
 * the generic "bereits angemeldet". `room_name` may be missing when the
 * backend's best-effort lookup couldn't resolve the existing visit (rare
 * race window between INSERT failure and response build) — fall back to
 * the generic message in that case.
 */
function formatStudentAlreadyActiveError(details: Record<string, unknown>): string {
  const roomName = details.room_name;
  if (typeof roomName === 'string' && roomName.length > 0) {
    return `Schüler*in ist bereits angemeldet in ${formatRoomName(roomName)}.`;
  }
  return 'Schüler*in ist bereits angemeldet.';
}

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * The registry code for a wire code. Accepts the code Phoenix sends today and
 * the renamed `bereich.fehlername` code (project-phoenix #2506) alike, so both
 * resolve to the same identity. Undefined for anything else.
 */
export function toErrorCode(code: string | undefined): ErrorCode | undefined {
  if (!code) return undefined;
  if (KNOWN_ERROR_CODES.has(code)) return code as ErrorCode;
  return LEGACY_ERROR_CODES[code];
}

/**
 * German copy for the error codes the kiosk can provoke, keyed by registry
 * code. Staff clock: project-phoenix #1654. Open-room destination booking:
 * POST /api/iot/move-to-room, #3067. Device auth, scan and session codes:
 * project-phoenix #3939.
 */
const CODE_MESSAGES: Readonly<Partial<Record<ErrorCode, string>>> = {
  'iot.activity_capacity_exceeded': 'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.',
  'iot.room_capacity_exceeded': 'Raum ist voll. Kein Platz mehr verfügbar.',
  'iot.student_already_active': 'Schüler*in ist bereits angemeldet.',
  'iot.invalid_staff_clock_request': 'Die Stempel-Anfrage ist ungültig. Bitte erneut versuchen.',
  'iot.invalid_rfid_tag': 'Das gelesene Armband ist ungültig. Bitte erneut scannen.',
  'iot.rfid_tag_not_found': 'Armband ist nicht zugewiesen. Bitte an die Leitung wenden.',
  'iot.rfid_tag_inactive': 'Dieses Armband ist deaktiviert. Bitte an die Leitung wenden.',
  'iot.rfid_tag_not_staff':
    'Dieses Armband gehört keinem Mitarbeitenden. Bitte das persönliche Armband verwenden.',
  'iot.planned_start_not_reached': 'Einstempeln ist vor dem geplanten Dienstbeginn nicht möglich.',
  'iot.deviation_reason_required': 'Für diese Abweichung vom Dienstplan ist eine Begründung nötig.',
  'iot.invalid_staff_clock_state': 'Diese Aktion passt nicht zum aktuellen Stempelstatus.',
  'iot.room_not_found': 'Diesen Raum gibt es nicht mehr. Bitte eine Betreuungskraft fragen.',
  'rooms.not_released': 'Dieser Raum ist gerade nicht offen. Bitte einen anderen Ort wählen.',
  'iot.student_not_present':
    'Das Kind ist heute noch nicht angemeldet. Bitte eine Betreuungskraft fragen.',
  'iot.open_room_binary_mode': 'Offene Räume gibt es an dieser Schule nicht.',
  'iot.device_api_key_required': 'API-Schlüssel nicht konfiguriert. Bitte .env Datei prüfen.',
  'iot.device_api_key_format_invalid': 'API-Schlüssel Format ungültig. Bearer Token erwartet.',
  'iot.device_api_key_invalid': 'API-Schlüssel ungültig. Bitte Geräte-Konfiguration prüfen.',
  'iot.device_pin_required': 'PIN nicht angegeben.',
  'iot.device_pin_invalid': 'Ungültiger PIN. Bitte erneut versuchen.',
  'iot.device_inactive': 'Gerät ist deaktiviert. Bitte Administrator kontaktieren.',
  'iot.rfid_tag_unassigned': 'Armband ist nicht zugewiesen. Bitte an die Leitung wenden.',
  'iot.rfid_tag_not_student_or_staff': 'Armband ist nicht zugewiesen. Bitte an die Leitung wenden.',
  'iot.person_not_student': 'Person ist kein Schüler.',
  'iot.pickup_student_rfid_required': 'Bitte Schüler-Armband scannen.',
  'iot.no_active_session': 'Keine aktive Sitzung. Bitte zuerst eine Aktivität starten.',
  'iot.no_session_to_end': 'Keine aktive Sitzung zum Beenden vorhanden.',
  'iot.no_active_groups_in_room': 'Keine aktiven Gruppen im ausgewählten Raum.',
  'iot.no_room_available': 'Für diese Aktivität fehlt ein Raum. Bitte einen Raum auswählen.',
  'iot.no_attendance_record_today': 'Schüler wurde heute noch nicht eingecheckt.',
  'iot.schulhof_not_configured':
    'Schulhof-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
  'iot.wc_not_configured':
    'Toilette-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
  'iot.wc_needs_staff':
    'Toilette-Aktivität konnte nicht erstellt werden. Bitte zuerst Betreuer-RFID scannen.',
  'iot.staff_not_found': 'Mitarbeiter nicht gefunden.',
  'iot.staff_rfid_tag_unassigned': 'Mitarbeiter hat kein Armband zugewiesen.',
};

/**
 * German copy per error class. An API error the kiosk has no specific text
 * for shows the text of its class, never an empty or English message.
 */
const ERROR_CLASS_MESSAGES: Readonly<Record<ErrorClass, string>> = {
  input: 'Die Angaben passen nicht. Bitte prüfen und erneut versuchen.',
  permission: 'Das ist hier nicht erlaubt. Bitte an die Leitung wenden.',
  business_rejection: 'Das geht gerade nicht. Bitte eine Betreuungskraft fragen.',
  unavailable: 'moto ist gerade nicht erreichbar. Bitte gleich erneut versuchen.',
  server: 'Das hat leider nicht geklappt. Bitte erneut versuchen.',
};

/**
 * Error class of an API error: from the registry when the code is known,
 * otherwise from the HTTP status the way Phoenix assigns its class codes
 * (backend/api/common/problem.go ErrorClassCode).
 */
function getErrorClass(error: ApiError): ErrorClass {
  const code = toErrorCode(error.code);
  if (code) return ERROR_CODE_CLASSES[code];
  switch (error.statusCode) {
    case 401:
    case 403:
      return 'permission';
    case 409:
    case 410:
    case 422:
      return 'business_rejection';
    case 408:
    case 429:
    case 499:
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      return error.statusCode >= 500 ? 'server' : 'input';
  }
}

/** Kiosk copy for the code of an API error, including its structured details. */
function getCodeMessage(error: ApiError): string | undefined {
  const code = toErrorCode(error.code);
  if (!code) return undefined;
  if (error.details) {
    if (code === 'iot.activity_capacity_exceeded') {
      return formatActivityCapacityError(error.details);
    }
    if (code === 'iot.room_capacity_exceeded') return formatRoomCapacityError(error.details);
    // Duplicate active visit (Issue #844)
    if (code === 'iot.student_already_active') {
      return formatStudentAlreadyActiveError(error.details);
    }
  }
  return CODE_MESSAGES[code];
}

/**
 * Map API errors to German user-friendly messages with rich details support.
 * An ApiError shows the kiosk text for its code, otherwise the text of its
 * error class. Any other error comes from the kiosk itself (network failure,
 * own validation) and already carries its German text.
 */
export function mapApiErrorToGerman(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : String(error);
  }

  return getCodeMessage(error) ?? ERROR_CLASS_MESSAGES[getErrorClass(error)];
}

/**
 * A request that never reached the server (apiClient). Carries the German
 * text to show; callers recognise it by type, never by its message.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Whether an error is a network-level error: the browser reports offline, or
 * the API client could not reach the server. An answer of the server
 * (ApiError) never is one.
 */
export function isNetworkRelatedError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error instanceof NetworkError;
}

/**
 * Context for network error messages shown to the user.
 * Each context keeps its historical wording so the visible copy stays identical.
 */
export type NetworkErrorContext =
  | 'generic'
  | 'retry'
  | 'sessionStart'
  | 'sessionValidation'
  | 'schulhofCheckin'
  | 'toiletteCheckin'
  | 'openRoomCheckin';

const NETWORK_ERROR_MESSAGES: Record<NetworkErrorContext, string> = {
  generic: 'Netzwerkfehler. Bitte Verbindung prüfen.',
  retry: 'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.',
  sessionStart:
    'Netzwerkfehler beim Starten der Aktivität. Bitte Verbindung prüfen und erneut versuchen.',
  sessionValidation:
    'Netzwerkfehler bei der Überprüfung der gespeicherten Sitzung. Bitte Verbindung prüfen und erneut versuchen.',
  schulhofCheckin:
    'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
  toiletteCheckin:
    'Netzwerkfehler bei Toilette-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
  openRoomCheckin: 'Netzwerkfehler beim Raumwechsel. Bitte Verbindung prüfen und erneut scannen.',
};

/**
 * Get the German network error message for a given UI context.
 * Follows the context parameter pattern of mapAttendanceErrorToGerman.
 */
export function getNetworkErrorMessage(context: NetworkErrorContext = 'generic'): string {
  return NETWORK_ERROR_MESSAGES[context];
}

type AttendanceErrorContext = 'toggle' | 'feedback';

/** Context-specific wording for 404 and 403 attendance errors. */
function getAttendanceContextMessage(
  error: ApiError,
  context: AttendanceErrorContext
): string | undefined {
  if (error.statusCode === 404) {
    switch (context) {
      case 'toggle':
        return 'Schüler nicht gefunden. RFID-Tag möglicherweise nicht zugewiesen.';
      case 'feedback':
        return 'Feedback-Service nicht erreichbar. Bitte später versuchen.';
    }
  }

  if (error.statusCode === 403) {
    switch (context) {
      case 'toggle':
        return 'Keine Berechtigung für An-/Abmeldung dieses Schülers.';
      case 'feedback':
        return 'Keine Berechtigung für Feedback-Übermittlung.';
    }
  }
  return undefined;
}

/**
 * Map attendance-specific errors to German user-friendly messages.
 * An ApiError shows the kiosk text for its code, then the context wording
 * for 404/403, then the text of its error class. Network errors show the
 * network text; any other error already carries its German text.
 */
export function mapAttendanceErrorToGerman(
  error: unknown,
  context: AttendanceErrorContext
): string {
  if (isNetworkRelatedError(error)) {
    return getNetworkErrorMessage('generic');
  }

  if (error instanceof ApiError) {
    return (
      getCodeMessage(error) ??
      getAttendanceContextMessage(error, context) ??
      ERROR_CLASS_MESSAGES[getErrorClass(error)]
    );
  }

  return error instanceof Error ? error.message : String(error);
}

/** Detect 404 responses by the HTTP status `apiCall` records on an ApiError. */
export const isNotFoundError = (error: unknown): boolean =>
  error instanceof ApiError && error.statusCode === 404;
