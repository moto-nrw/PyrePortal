/**
 * Error mapping for the PyrePortal API layer.
 * Maps backend error strings to German UI messages (contract with project-phoenix).
 */

/**
 * Structured API error response with optional details
 * Used for rich error responses like capacity exceeded
 */
export interface ApiErrorResponse {
  status: string;
  message: string;
  code?: string;
  details?: {
    // Room capacity fields
    room_id?: number;
    room_name?: string;
    current_occupancy?: number;
    max_capacity?: number;
    // Activity capacity fields
    activity_id?: number;
    activity_name?: string;
    current_participants?: number;
    max_participants?: number;
    // Duplicate-active-visit fields (Issue #844, backend STUDENT_ALREADY_ACTIVE)
    student_id?: number;
    existing_visit_id?: number;
    entry_time?: string;
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

/**
 * Error message mapping entry.
 * Pattern can be a single string or array of strings (OR logic).
 */
type ErrorMapping = readonly [pattern: string | readonly string[], germanMessage: string];

/**
 * Error message mappings ordered by specificity.
 *
 * IMPORTANT: Order matters! Specific messages MUST come before generic patterns.
 * The first matching pattern wins.
 *
 * Backend error messages sourced from:
 * - /backend/auth/device/errors.go
 * - /backend/api/iot/common/errors.go
 * - /backend/api/iot/checkin/workflow.go
 * - /backend/api/iot/sessions/handlers.go
 * - /backend/api/iot/attendance/handlers.go
 * - /backend/api/iot/rfid/handlers.go
 * - /backend/api/iot/feedback/handlers.go
 */
export const ERROR_MESSAGE_MAPPINGS: readonly ErrorMapping[] = [
  // 1. CAPACITY ERRORS (409)
  // Backend sends both lowercase (Go errors) and capitalized (JSON Message field)
  [
    ['ACTIVITY_CAPACITY_EXCEEDED', 'activity capacity exceeded', 'Activity capacity exceeded'],
    'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.',
  ],
  [
    ['ROOM_CAPACITY_EXCEEDED', 'room capacity exceeded', 'Room capacity exceeded'],
    'Raum ist voll. Kein Platz mehr verfügbar.',
  ],
  // Duplicate active visit (Issue #844, backend migration 1.15.45 + checkin/workflow.go)
  [
    ['STUDENT_ALREADY_ACTIVE', 'student already has an active visit'],
    'Schüler*in ist bereits angemeldet.',
  ],

  // 2. AUTHENTICATION ERRORS (401)
  ['invalid device API key', 'API-Schlüssel ungültig. Bitte Geräte-Konfiguration prüfen.'],
  ['device API key is required', 'API-Schlüssel nicht konfiguriert. Bitte .env Datei prüfen.'],
  ['invalid API key format', 'API-Schlüssel Format ungültig. Bearer Token erwartet.'],
  ['invalid staff PIN', 'Ungültiger PIN. Bitte erneut versuchen.'],
  ['staff PIN is required', 'PIN nicht angegeben.'],
  [
    'staff account is locked due to failed PIN attempts',
    'Konto gesperrt wegen zu vieler Fehlversuche. Bitte Administrator kontaktieren.',
  ],
  ['maximum PIN attempts exceeded', 'Maximale PIN-Versuche überschritten. Konto gesperrt.'],
  ['locked', 'Konto gesperrt. Bitte später erneut versuchen.'], // Generic fallback for lock-related

  // 3. AUTHORIZATION ERRORS (403)
  ['device is not active', 'Gerät ist deaktiviert. Bitte Administrator kontaktieren.'],
  ['device is offline', 'Gerät ist als offline markiert. Bitte Administrator kontaktieren.'],

  // 4. SESSION ERRORS (400/409)
  [
    'device is already running an activity session',
    'Gerät führt bereits eine Aktivität durch. Bitte zuerst beenden.',
  ],
  ['no active session to end', 'Keine aktive Sitzung zum Beenden vorhanden.'],
  ['no active session', 'Keine aktive Sitzung. Bitte zuerst eine Aktivität starten.'],
  ['invalid session ID', 'Ungültige Sitzungs-ID.'],
  ['activity_id is required', 'Aktivität muss ausgewählt werden.'],
  ['at least one supervisor', 'Mindestens ein Betreuer muss ausgewählt werden.'], // Matches both variants

  // 5. RFID ERRORS (400/404) - Only cases where "Armband nicht zugewiesen" is appropriate
  [
    ['RFID tag not found', 'RFID tag not assigned'],
    'Armband ist nicht zugewiesen. Bitte an Betreuer wenden.',
  ],
  [
    'staff RFID authentication must be done via session management',
    'Betreuer-Armband kann hier nicht verwendet werden.',
  ],
  ['student RFID tag required for pickup query', 'Bitte Schüler-Armband scannen.'],
  ['RFID parameter is required', 'RFID-Tag fehlt in der Anfrage.'],

  // 6. ATTENDANCE/VISIT ERRORS (404)
  ['no active visit found for student', 'Kein aktiver Besuch für diesen Schüler gefunden.'],
  ['person is not a student', 'Person ist kein Schüler.'],
  ['no active groups in specified room', 'Keine aktiven Gruppen im ausgewählten Raum.'],

  // 7. STAFF ERRORS (400/404)
  ['invalid staff ID', 'Ungültige Mitarbeiter-ID.'],
  ['staff not found', 'Mitarbeiter nicht gefunden.'],
  ['staff has no RFID tag assigned', 'Mitarbeiter hat kein Armband zugewiesen.'],

  // 8. FEEDBACK ERRORS (400/404)
  ['student_id is required', 'Schüler-ID fehlt.'],
  ['value is required', 'Bewertung fehlt.'],
  ['student not found', 'Schüler nicht gefunden.'],

  // 9. VALIDATION ERRORS (400)
  ['room_id is required for check-in', 'Raum muss für Check-in ausgewählt werden.'],
  ['tagId parameter is required', 'Tag-ID fehlt in der Anfrage.'],
  ["destination must be 'zuhause' or 'unterwegs'", "Ziel muss 'zuhause' oder 'unterwegs' sein."],
  [
    'destination is required for confirm_daily_checkout',
    'Ziel muss für endgültiges Auschecken angegeben werden.',
  ],

  // 10. INTERNAL SERVER ERRORS (500)
  [
    'schulhof activity not configured',
    'Schulhof-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
  ],
  [
    'WC activity not configured',
    'Toilette-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.',
  ],
  [
    'WC activity auto-create requires staff context',
    'Toilette-Aktivität konnte nicht erstellt werden. Bitte zuerst Betreuer-RFID scannen.',
  ],
  [
    'failed to create Schulhof session',
    'Schulhof-Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.',
  ],
  [
    'failed to create WC session',
    'Toilette-Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.',
  ],
  // Generic fallback — MUST stay AFTER specific 'failed to create Toilette/Schulhof session' entries (substring match)
  ['failed to create session', 'Sitzung konnte nicht erstellt werden. Bitte erneut versuchen.'],
  ['failed to create visit record', 'Besuch konnte nicht erstellt werden. Bitte erneut versuchen.'],
  ['failed to end visit record', 'Besuch konnte nicht beendet werden. Bitte erneut versuchen.'],
  ['failed to get room information', 'Rauminformationen konnten nicht abgerufen werden.'],
  ['failed to check room capacity', 'Raumkapazität konnte nicht geprüft werden.'],
  ['failed to get activity information', 'Aktivitätsinformationen konnten nicht abgerufen werden.'],
  ['failed to check activity capacity', 'Aktivitätskapazität konnte nicht geprüft werden.'],
  ['error finding active groups in room', 'Aktive Gruppen im Raum konnten nicht gefunden werden.'],
  [
    'failed to get person data for staff',
    'Personendaten für Mitarbeiter konnten nicht abgerufen werden.',
  ],

  // 11. GENERIC HTTP STATUS CODES - Fallbacks (must be after specific messages)
  [['401', 'Unauthorized'], 'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.'],
  [['403', 'Forbidden'], 'Keine Berechtigung für diese Aktion.'],
  [['404', 'not found', 'Not Found'], 'Ressource nicht gefunden. Bitte Konfiguration prüfen.'],
  [['409', 'Conflict'], 'Konflikt bei der Anfrage. Bitte erneut versuchen.'],
  [['400', 'Bad Request'], 'Ungültige Anfrage. Bitte Eingaben prüfen.'],
  [
    ['500', '502', '503', '504', 'Internal Server Error', 'Bad Gateway', 'Service Unavailable'],
    'Server nicht erreichbar. Bitte später versuchen.',
  ],
] as const;

/**
 * Map server error messages to German user-friendly messages.
 * Uses a data-driven approach with ordered pattern matching.
 */
export function mapServerErrorToGerman(errorMessage: string): string {
  for (const [patterns, germanMessage] of ERROR_MESSAGE_MAPPINGS) {
    const patternList = typeof patterns === 'string' ? [patterns] : patterns;
    if (patternList.some(pattern => errorMessage.includes(pattern))) {
      return germanMessage;
    }
  }
  return errorMessage; // Fallback - return original for unknown errors
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
  const currentParticipants = details.current_participants;
  const maxParticipants = details.max_participants;

  if (isStringOrNumber(activityName) && isStringOrNumber(maxParticipants)) {
    const current = isStringOrNumber(currentParticipants) ? currentParticipants : maxParticipants;
    return `${activityName} ist voll (${current}/${maxParticipants} Teilnehmer).`;
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

/**
 * Map API errors to German user-friendly messages with rich details support
 * Handles structured error responses (e.g., capacity errors with room/activity details)
 */
export function mapApiErrorToGerman(error: unknown): string {
  // Handle non-ApiError cases first
  if (!(error instanceof ApiError)) {
    const message = error instanceof Error ? error.message : String(error);
    return mapServerErrorToGerman(message);
  }

  // Activity capacity exceeded
  if (error.code === 'ACTIVITY_CAPACITY_EXCEEDED' && error.details) {
    return formatActivityCapacityError(error.details);
  }

  // Room capacity exceeded
  if (error.code === 'ROOM_CAPACITY_EXCEEDED' && error.details) {
    return formatRoomCapacityError(error.details);
  }

  // Duplicate active visit (Issue #844)
  if (error.code === 'STUDENT_ALREADY_ACTIVE' && error.details) {
    return formatStudentAlreadyActiveError(error.details);
  }

  // Fall back to message-based mapping
  return mapServerErrorToGerman(error.message);
}

/**
 * Patterns that indicate a network-related error
 * Includes both English (technical) and German (translated) patterns
 */
const NETWORK_ERROR_PATTERNS = [
  'network',
  'netzwerk',
  'failed to fetch',
  'fetch',
  'networkerror',
  'timeout',
  'timed out',
  'connection',
  'verbindung',
  'offline',
];

/**
 * Check if an error (object or message) indicates a network-level error
 * Checks navigator.onLine first, then pattern-matches the error message
 */
export function isNetworkRelatedError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern));
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
  | 'toiletteCheckin';

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
};

/**
 * Get the German network error message for a given UI context.
 * Follows the context parameter pattern of mapAttendanceErrorToGerman.
 */
export function getNetworkErrorMessage(context: NetworkErrorContext = 'generic'): string {
  return NETWORK_ERROR_MESSAGES[context];
}

/**
 * Map attendance-specific errors to German user-friendly messages
 * Provides context-aware error messages for attendance operations
 *
 * This function first tries to match specific backend messages via
 * mapServerErrorToGerman, then falls back to context-specific generic messages.
 */
export function mapAttendanceErrorToGerman(
  errorMessage: string,
  context: 'toggle' | 'feedback'
): string {
  // Network errors - use consolidated handler
  if (isNetworkRelatedError(errorMessage)) {
    return getNetworkErrorMessage('generic');
  }

  // ============================================================
  // Try specific backend messages first via main mapper
  // If it returns the original message, it means no specific match was found
  // ============================================================
  const specificMessage = mapServerErrorToGerman(errorMessage);

  // Check if a specific mapping was found (not returned unchanged)
  // We check both exact match and common generic fallbacks
  const isGenericFallback =
    specificMessage === errorMessage ||
    specificMessage === 'Ressource nicht gefunden. Bitte Konfiguration prüfen.' ||
    specificMessage === 'Keine Berechtigung für diese Aktion.' ||
    specificMessage === 'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.' ||
    specificMessage === 'Ungültige Anfrage. Bitte Eingaben prüfen.';

  // If a specific message was found, use it
  if (!isGenericFallback) {
    return specificMessage;
  }

  // ============================================================
  // Context-specific fallbacks for generic HTTP status codes
  // ============================================================

  // 404 errors - context-specific messages
  // Include lowercase 'not found' for consistency with main mapper
  if (
    errorMessage.includes('404') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('Not Found')
  ) {
    switch (context) {
      case 'toggle':
        return 'Schüler nicht gefunden. RFID-Tag möglicherweise nicht zugewiesen.';
      case 'feedback':
        return 'Feedback-Service nicht erreichbar. Bitte später versuchen.';
    }
  }

  // 403 errors - permission denied
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    switch (context) {
      case 'toggle':
        return 'Keine Berechtigung für An-/Abmeldung dieses Schülers.';
      case 'feedback':
        return 'Keine Berechtigung für Feedback-Übermittlung.';
    }
  }

  // 401 errors - authentication issues
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    return 'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.';
  }

  // 400 errors - bad request
  if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
    return 'Ungültige Anfrage. Bitte Eingaben prüfen.';
  }

  // Fallback - use generic mapper result (handles 5xx errors and other cases)
  return specificMessage;
}

/**
 * Detect 404 responses. Prefer the structured `ApiError.statusCode` set by
 * `apiCall`. Keep the substring fallback so errors that are not `ApiError`
 * instances (or wrapped messages) still resolve the same way as before.
 */
export const isNotFoundError = (error: unknown, errorMessage: string): boolean => {
  if (error instanceof ApiError && error.statusCode === 404) {
    return true;
  }
  return errorMessage.includes('404');
};
