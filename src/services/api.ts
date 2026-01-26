/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 */

import { createLogger } from '../utils/logger';
import { safeInvoke } from '../utils/tauriContext';

const logger = createLogger('API');

// API configuration interface
interface ApiConfig {
  api_base_url: string;
  device_api_key: string;
}

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
 * Map server error messages to German user-friendly messages
 *
 * IMPORTANT: Order matters! Specific backend messages MUST be checked BEFORE
 * generic HTTP status codes to avoid false matches.
 *
 * Pattern: specific message → generic status code → fallback
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
export function mapServerErrorToGerman(errorMessage: string): string {
  // ============================================================
  // 1. CAPACITY ERRORS (409) - Check specific codes first
  // ============================================================
  if (errorMessage.includes('ACTIVITY_CAPACITY_EXCEEDED')) {
    return 'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.';
  }
  if (
    errorMessage.includes('ROOM_CAPACITY_EXCEEDED') ||
    errorMessage.includes('Room capacity exceeded')
  ) {
    return 'Raum ist voll. Kein Platz mehr verfügbar.';
  }

  // ============================================================
  // 2. AUTHENTICATION ERRORS (401) - Specific messages first
  // ============================================================

  // API Key errors
  if (errorMessage.includes('invalid device API key')) {
    return 'API-Schlüssel ungültig. Bitte Geräte-Konfiguration prüfen.';
  }
  if (errorMessage.includes('device API key is required')) {
    return 'API-Schlüssel nicht konfiguriert. Bitte .env Datei prüfen.';
  }
  if (errorMessage.includes('invalid API key format')) {
    return 'API-Schlüssel Format ungültig. Bearer Token erwartet.';
  }

  // PIN errors - specific messages
  if (errorMessage.includes('invalid staff PIN')) {
    return 'Ungültiger PIN. Bitte erneut versuchen.';
  }
  if (errorMessage.includes('staff PIN is required')) {
    return 'PIN nicht angegeben.';
  }
  if (errorMessage.includes('staff account is locked due to failed PIN attempts')) {
    return 'Konto gesperrt wegen zu vieler Fehlversuche. Bitte Administrator kontaktieren.';
  }
  if (errorMessage.includes('maximum PIN attempts exceeded')) {
    return 'Maximale PIN-Versuche überschritten. Konto gesperrt.';
  }
  // Generic "locked" as fallback for lock-related errors
  if (errorMessage.includes('locked')) {
    return 'Konto gesperrt. Bitte später erneut versuchen.';
  }

  // ============================================================
  // 3. AUTHORIZATION ERRORS (403) - Device status
  // ============================================================
  if (errorMessage.includes('device is not active')) {
    return 'Gerät ist deaktiviert. Bitte Administrator kontaktieren.';
  }
  if (errorMessage.includes('device is offline')) {
    return 'Gerät ist als offline markiert. Bitte Administrator kontaktieren.';
  }

  // ============================================================
  // 4. SESSION ERRORS (400/409) - Specific messages
  // ============================================================
  if (errorMessage.includes('device is already running an activity session')) {
    return 'Gerät führt bereits eine Aktivität durch. Bitte zuerst beenden.';
  }
  if (errorMessage.includes('no active session to end')) {
    return 'Keine aktive Sitzung zum Beenden vorhanden.';
  }
  if (errorMessage.includes('no active session')) {
    return 'Keine aktive Sitzung. Bitte zuerst eine Aktivität starten.';
  }
  if (errorMessage.includes('invalid session ID')) {
    return 'Ungültige Sitzungs-ID.';
  }
  if (errorMessage.includes('activity_id is required')) {
    return 'Aktivität muss ausgewählt werden.';
  }
  // Backend has two variants: "at least one supervisor is required" and "at least one supervisor ID is required"
  if (errorMessage.includes('at least one supervisor')) {
    return 'Mindestens ein Betreuer muss ausgewählt werden.';
  }

  // ============================================================
  // 5. RFID ERRORS (400/404) - Specific backend messages
  // These are the ONLY cases where "Armband nicht zugewiesen" is appropriate
  // ============================================================
  if (
    errorMessage.includes('RFID tag not found') ||
    errorMessage.includes('RFID tag not assigned')
  ) {
    return 'Armband ist nicht zugewiesen. Bitte an Betreuer wenden.';
  }
  if (errorMessage.includes('staff RFID authentication must be done via session management')) {
    return 'Betreuer-Armband kann hier nicht verwendet werden.';
  }
  if (errorMessage.includes('RFID parameter is required')) {
    return 'RFID-Tag fehlt in der Anfrage.';
  }

  // ============================================================
  // 6. ATTENDANCE/VISIT ERRORS (404) - Specific messages
  // ============================================================
  if (errorMessage.includes('no active visit found for student')) {
    return 'Kein aktiver Besuch für diesen Schüler gefunden.';
  }
  if (errorMessage.includes('person is not a student')) {
    return 'Person ist kein Schüler.';
  }
  if (errorMessage.includes('no active groups in specified room')) {
    return 'Keine aktiven Gruppen im ausgewählten Raum.';
  }

  // ============================================================
  // 7. STAFF ERRORS (400/404) - Specific messages
  // ============================================================
  if (errorMessage.includes('invalid staff ID')) {
    return 'Ungültige Mitarbeiter-ID.';
  }
  if (errorMessage.includes('staff not found')) {
    return 'Mitarbeiter nicht gefunden.';
  }
  if (errorMessage.includes('staff has no RFID tag assigned')) {
    return 'Mitarbeiter hat kein Armband zugewiesen.';
  }

  // ============================================================
  // 8. FEEDBACK ERRORS (400/404) - Specific messages
  // ============================================================
  if (errorMessage.includes('student_id is required')) {
    return 'Schüler-ID fehlt.';
  }
  if (errorMessage.includes('value is required')) {
    return 'Bewertung fehlt.';
  }
  if (errorMessage.includes('student not found')) {
    return 'Schüler nicht gefunden.';
  }

  // ============================================================
  // 9. VALIDATION ERRORS (400) - Specific messages
  // ============================================================
  if (errorMessage.includes('room_id is required for check-in')) {
    return 'Raum muss für Check-in ausgewählt werden.';
  }
  if (errorMessage.includes('tagId parameter is required')) {
    return 'Tag-ID fehlt in der Anfrage.';
  }
  if (errorMessage.includes("destination must be 'zuhause' or 'unterwegs'")) {
    return "Ziel muss 'zuhause' oder 'unterwegs' sein.";
  }
  if (errorMessage.includes('destination is required for confirm_daily_checkout')) {
    return 'Ziel muss für endgültiges Auschecken angegeben werden.';
  }

  // ============================================================
  // 10. INTERNAL SERVER ERRORS (500) - Specific messages
  // ============================================================
  if (errorMessage.includes('schulhof activity not configured')) {
    return 'Schulhof-Aktivität nicht konfiguriert. Bitte Administrator kontaktieren.';
  }
  if (errorMessage.includes('failed to create visit record')) {
    return 'Besuch konnte nicht erstellt werden. Bitte erneut versuchen.';
  }
  if (errorMessage.includes('failed to end visit record')) {
    return 'Besuch konnte nicht beendet werden. Bitte erneut versuchen.';
  }
  if (errorMessage.includes('failed to get room information')) {
    return 'Rauminformationen konnten nicht abgerufen werden.';
  }
  if (errorMessage.includes('failed to check room capacity')) {
    return 'Raumkapazität konnte nicht geprüft werden.';
  }
  if (errorMessage.includes('failed to get activity information')) {
    return 'Aktivitätsinformationen konnten nicht abgerufen werden.';
  }
  if (errorMessage.includes('failed to check activity capacity')) {
    return 'Aktivitätskapazität konnte nicht geprüft werden.';
  }
  if (errorMessage.includes('error finding active groups in room')) {
    return 'Aktive Gruppen im Raum konnten nicht gefunden werden.';
  }
  if (errorMessage.includes('failed to get person data for staff')) {
    return 'Personendaten für Mitarbeiter konnten nicht abgerufen werden.';
  }

  // ============================================================
  // 11. GENERIC HTTP STATUS CODES - Only match if no specific message matched
  // These are FALLBACKS and should be last before the final fallback
  // ============================================================

  // Generic 401 - only if no specific auth error matched above
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    return 'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.';
  }

  // Generic 403 - only if no specific permission error matched above
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    return 'Keine Berechtigung für diese Aktion.';
  }

  // Generic 404 - likely wrong API URL or endpoint doesn't exist
  // MUST be after all specific "not found" messages
  // Include lowercase 'not found' to catch unanticipated backend messages
  if (
    errorMessage.includes('404') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('Not Found')
  ) {
    return 'Ressource nicht gefunden. Bitte Konfiguration prüfen.';
  }

  // Generic 409 - conflict (capacity errors handled above)
  if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
    return 'Konflikt bei der Anfrage. Bitte erneut versuchen.';
  }

  // Generic 400 - bad request (validation errors handled above)
  if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
    return 'Ungültige Anfrage. Bitte Eingaben prüfen.';
  }

  // Generic 5xx - server errors
  if (
    errorMessage.includes('500') ||
    errorMessage.includes('502') ||
    errorMessage.includes('503') ||
    errorMessage.includes('504') ||
    errorMessage.includes('Internal Server Error') ||
    errorMessage.includes('Bad Gateway') ||
    errorMessage.includes('Service Unavailable')
  ) {
    return 'Server nicht erreichbar. Bitte später versuchen.';
  }

  // ============================================================
  // 12. FINAL FALLBACK - Return original for unknown errors
  // ============================================================
  return errorMessage;
}

/** Type guard to check if value is a string or number */
function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
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
    return `${roomName} ist voll (${current}/${maxCapacity} Plätze belegt).`;
  }
  return 'Raum ist voll. Kein Platz mehr verfügbar.';
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
 * Map attendance-specific errors to German user-friendly messages
 * Provides context-aware error messages for attendance operations
 *
 * This function first tries to match specific backend messages via
 * mapServerErrorToGerman, then falls back to context-specific generic messages.
 */
function mapAttendanceErrorToGerman(
  errorMessage: string,
  context: 'status' | 'toggle' | 'feedback'
): string {
  // Network errors - use consolidated handler
  if (isNetworkRelatedError(errorMessage)) {
    return 'Netzwerkfehler. Bitte Verbindung prüfen.';
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
      case 'status':
        return 'Schüler nicht gefunden oder keine Anwesenheitsdaten für heute verfügbar.';
      case 'toggle':
        return 'Schüler nicht gefunden. RFID-Tag möglicherweise nicht zugewiesen.';
      case 'feedback':
        return 'Feedback-Service nicht erreichbar. Bitte später versuchen.';
    }
  }

  // 403 errors - permission denied
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    switch (context) {
      case 'status':
        return 'Keine Berechtigung für Anwesenheitsstatus dieses Schülers.';
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

// Environment configuration - will be loaded at runtime
let API_BASE_URL = '';
let DEVICE_API_KEY = '';
let isInitialized = false;

// Network status callback - set by the app to receive status updates from API calls
type NetworkStatusCallback = (quality: 'online' | 'poor' | 'offline', responseTime: number) => void;
let networkStatusCallback: NetworkStatusCallback | null = null;

const POOR_THRESHOLD_MS = 1000;

/**
 * Register a callback to receive network status updates from API calls
 */
export function setNetworkStatusCallback(callback: NetworkStatusCallback | null): void {
  networkStatusCallback = callback;
}

/**
 * Report network status based on API call result
 */
function reportNetworkStatus(responseTime: number, success: boolean): void {
  if (!networkStatusCallback) {
    logger.debug('Network status callback not registered, skipping update');
    return;
  }

  let quality: 'online' | 'poor' | 'offline';
  if (success) {
    quality = responseTime > POOR_THRESHOLD_MS ? 'poor' : 'online';
  } else {
    quality = 'offline';
  }
  logger.debug('Reporting network status', { quality, responseTime, success });

  networkStatusCallback(quality, responseTime);
}

/**
 * Initialize API configuration from Tauri backend
 */
export async function initializeApi(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Try to get config from Tauri backend
    const config = await safeInvoke<ApiConfig>('get_api_config');
    API_BASE_URL = config.api_base_url;
    DEVICE_API_KEY = config.device_api_key;
    isInitialized = true;

    logger.info('API initialized with runtime configuration', {
      baseUrl: API_BASE_URL,
      hasApiKey: !!DEVICE_API_KEY,
    });
  } catch (error) {
    // Fallback to build-time env vars if Tauri is not available (e.g., in dev without Tauri)
    logger.warn('Failed to load runtime config, falling back to build-time env vars', { error });
    API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8080';
    DEVICE_API_KEY = import.meta.env.VITE_DEVICE_API_KEY as string;

    if (!DEVICE_API_KEY) {
      throw new Error(
        'API key not found. Please set DEVICE_API_KEY or VITE_DEVICE_API_KEY environment variable'
      );
    }

    isInitialized = true;
  }
}

/**
 * Ensure API is initialized before making calls
 */
async function ensureInitialized(): Promise<void> {
  if (!isInitialized) {
    await initializeApi();
  }
}

/**
 * Handle network-level fetch errors and convert to user-friendly German messages
 * Extracted to reduce cognitive complexity in apiCall
 */
function handleNetworkError(error: unknown, endpoint: string, startTime: number): never {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const responseTime = Date.now() - startTime;

  logger.warn('Network error', {
    endpoint,
    responseTime,
    errorName: errorObj.name,
    errorMessage: errorObj.message,
  });

  reportNetworkStatus(responseTime, false);

  // Map error types to German messages
  if (errorObj.name === 'TypeError' && errorObj.message.includes('fetch')) {
    throw new Error('Keine Netzwerkverbindung. Bitte WLAN prüfen.');
  }
  if (errorObj.name === 'AbortError') {
    throw new Error('Zeitüberschreitung. Server antwortet nicht.');
  }
  if (errorObj.message.includes('NetworkError') || errorObj.message.includes('network')) {
    throw new Error('Netzwerkfehler. Bitte Verbindung prüfen.');
  }
  throw new Error('Verbindungsfehler. Bitte Netzwerkverbindung prüfen.');
}

/**
 * Parse error response body and extract structured error data
 * Extracted to reduce cognitive complexity in apiCall
 */
async function parseErrorResponse(
  response: Response,
  baseMessage: string
): Promise<{ message: string; code?: string; details?: ApiErrorResponse['details'] }> {
  try {
    const errorData = (await response.json()) as ApiErrorResponse;
    // Extract error detail from response - check message first, then error field
    const errorDetail = errorData.message ?? (errorData as { error?: string }).error;
    const message = errorDetail ? `${baseMessage}: ${errorDetail}` : baseMessage;
    return { message, code: errorData.code, details: errorData.details };
  } catch {
    // JSON parsing failed, use base message
    return { message: baseMessage };
  }
}

/** Endpoints that should always be logged for debugging */
const ALWAYS_LOG_ENDPOINTS = new Set(['/api/iot/ping', '/api/iot/checkin']);

/**
 * Generic API call function with error handling and response timing
 */
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  await ensureInitialized();

  const url = `${API_BASE_URL}${endpoint}`;
  const startTime = Date.now();

  // Debug logging for authentication issues
  if (endpoint === '/api/iot/ping') {
    logger.debug('Making ping request', {
      url,
      method: options.method,
      hasAuth: !!(options.headers as Record<string, string>)?.Authorization,
      hasPin: !!(options.headers as Record<string, string>)?.['X-Staff-PIN'],
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    handleNetworkError(error, endpoint, startTime);
  }

  const responseTime = Date.now() - startTime;

  if (!response.ok) {
    const baseMessage = `API Error: ${response.status} - ${response.statusText}`;
    const { message, code, details } = await parseErrorResponse(response, baseMessage);

    logger.warn('API request failed', {
      endpoint,
      status: response.status,
      responseTime,
      error: message,
      errorCode: code,
      errorDetails: details,
    });

    throw new ApiError(message, response.status, code, details);
  }

  // Log successful request timing for critical endpoints or slow responses
  if (ALWAYS_LOG_ENDPOINTS.has(endpoint) || responseTime > 1000) {
    logger.info('API request completed', {
      endpoint,
      status: response.status,
      responseTime,
      quality: responseTime < POOR_THRESHOLD_MS ? 'online' : 'poor',
    });
  }

  reportNetworkStatus(responseTime, true);

  return response.json() as Promise<T>;
}

/**
 * Teacher data structure from API
 */
export interface Teacher {
  staff_id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  display_name: string;
}

/**
 * API response structure for teachers
 */
interface TeacherResponse {
  status: string;
  data: Teacher[];
  message: string;
}

/**
 * PIN validation response interface
 */
export interface PinValidationResult {
  success: boolean;
  userData?: {
    deviceName: string;
    staffName: string;
    staffId: number;
  };
  error?: string;
  isLocked?: boolean;
}

/**
 * Activity data structure from API
 */
export interface ActivityResponse {
  id: number;
  name: string;
  category: string;
  // Optional fields that might not be present in the new API
  category_name?: string;
  category_color?: string;
  room_name?: string;
  enrollment_count?: number;
  max_participants?: number;
  has_spots?: boolean;
  supervisor_name?: string;
  is_active?: boolean;
}

/**
 * API response structure for activities
 */
interface ActivitiesResponse {
  status: string;
  data: ActivityResponse[];
  message: string;
}

/**
 * Room data structure from API
 */
export interface Room {
  id: number;
  name: string;
  room_type?: string;
  capacity?: number;
  building?: string;
  floor?: number;
  category?: string;
  color?: string;
  is_occupied: boolean;
}

/**
 * API response structure for rooms
 */
interface RoomsResponse {
  status: string;
  data: Room[];
  message: string;
}

/**
 * Session start request structure
 */
export interface SessionStartRequest {
  activity_id: number;
  room_id?: number; // Optional: Override the activity's planned room
  supervisor_ids: number[]; // Required: Array of staff IDs who will supervise
  force?: boolean; // Optional: Force start even if conflicts exist
}

/**
 * Supervisor info in session response
 */
export interface SupervisorInfo {
  staff_id: number;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
}

/**
 * Session start response structure
 */
export interface SessionStartResponse {
  active_group_id: number;
  activity_id: number;
  device_id: number;
  start_time: string;
  supervisors: SupervisorInfo[];
  status: string;
  message: string;
}

/**
 * Current session info structure
 */
export interface CurrentSession {
  active_group_id: number;
  activity_id: number;
  activity_name?: string;
  room_id?: number;
  room_name?: string;
  device_id: number;
  start_time: string;
  duration: string;
  is_active?: boolean;
  active_students?: number;
  supervisors?: SupervisorInfo[];
}

/**
 * API functions
 */
export const api = {
  /**
   * Get teachers list (device authenticated)
   * Endpoint: GET /api/iot/teachers
   */
  async getTeachers(): Promise<Teacher[]> {
    const response = await apiCall<TeacherResponse>('/api/iot/teachers', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
      },
    });

    return response.data;
  },

  /**
   * Validate global OGS PIN
   * Endpoint: POST /api/iot/ping
   */
  async validateGlobalPin(pin: string): Promise<PinValidationResult> {
    try {
      logger.debug('Starting global PIN validation', {
        pin: pin.length + ' digits',
        hasApiKey: !!DEVICE_API_KEY,
        apiKeyLength: DEVICE_API_KEY?.length,
      });

      await apiCall('/api/iot/ping', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.info('Global PIN validation successful');

      return {
        success: true,
        userData: {
          deviceName: 'OGS Device',
          staffName: 'OGS Global User',
          staffId: 0, // No specific staff ID for global PIN
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Global PIN validation failed', {
        error: errorMessage,
      });

      // Use the error mapping function for user-friendly messages
      const userMessage = mapServerErrorToGerman(errorMessage);

      return {
        success: false,
        error: userMessage,
      };
    }
  },

  /**
   * Validate teacher PIN with enhanced error handling
   * Endpoint: GET /api/iot/status
   */
  async validateTeacherPin(pin: string, staffId: number): Promise<PinValidationResult> {
    try {
      logger.debug('Starting PIN validation');

      const response = await apiCall<{
        status: string;
        data: {
          device: { id: number; device_id: string; name: string; status: string };
          staff: { id: number; person_id: number };
          person: { first_name: string; last_name: string };
          authenticated_at: string;
        };
        message: string;
      }>('/api/iot/status', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
          'X-Staff-ID': staffId.toString(),
        },
      });

      logger.info('PIN validation successful');

      // Check if response has the expected structure
      if (!response.data?.device || !response.data.person || !response.data.staff) {
        logger.error('Unexpected response structure', { response });
        return {
          success: false,
          error: 'Unerwartete Server-Antwort. Bitte versuchen Sie es erneut.',
        };
      }

      const { device, person, staff } = response.data;

      return {
        success: true,
        userData: {
          deviceName: device.name || 'Unknown Device',
          staffName: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
          staffId: staff.id,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('PIN validation failed', {
        error: errorMessage,
      });

      // Use the error mapping function for user-friendly messages
      const userMessage = mapServerErrorToGerman(errorMessage);

      // Check if account is locked (423 status)
      const isLocked = errorMessage.includes('423') || errorMessage.includes('locked');

      return {
        success: false,
        error: userMessage,
        isLocked,
      };
    }
  },

  /**
   * Get teacher's activities for today
   * Endpoint: GET /api/iot/activities
   */
  async getActivities(pin: string): Promise<ActivityResponse[]> {
    const response = await apiCall<ActivitiesResponse>('/api/iot/activities', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Device health check (unauthenticated)
   * Endpoint: GET /health
   * Note: Returns plain text "OK", not JSON, so we don't use apiCall
   */
  async healthCheck(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    // Response is plain text "OK", not JSON - no parsing needed
  },

  /**
   * Device health ping (authenticated)
   * Endpoint: POST /api/iot/ping
   */
  async pingDevice(pin: string): Promise<void> {
    await apiCall('/api/iot/ping', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
  },

  /**
   * Get available rooms (device authenticated)
   * Endpoint: GET /api/iot/rooms/available
   */
  async getRooms(pin: string, capacity?: number): Promise<Room[]> {
    const params = new URLSearchParams();
    if (capacity) {
      params.append('capacity', capacity.toString());
    }

    const queryString = params.toString();
    const queryPart = queryString ? `?${queryString}` : '';
    const endpoint = `/api/iot/rooms/available${queryPart}`;

    const response = await apiCall<RoomsResponse>(endpoint, {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Start activity session with multiple supervisors
   * Endpoint: POST /api/iot/session/start
   */
  async startSession(pin: string, request: SessionStartRequest): Promise<SessionStartResponse> {
    logger.info('Starting session with request:', { ...request });

    const response = await apiCall<{
      status: string;
      data: SessionStartResponse;
      message?: string;
    }>('/api/iot/session/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(request),
    });

    return response.data;
  },

  /**
   * Get current session for device
   * Endpoint: GET /api/iot/session/current
   */
  async getCurrentSession(pin: string): Promise<CurrentSession | null> {
    try {
      const response = await apiCall<{
        status: string;
        data: CurrentSession | { device_id: number; is_active: false };
        message?: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      // Check if we have an active session
      if ('is_active' in response.data && response.data.is_active === false) {
        return null;
      }

      // The server returns the session data directly in the data field
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means no current session, which is fine
      if (errorMessage.includes('404')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * End current session
   * Endpoint: POST /api/iot/session/end
   */
  async endSession(pin: string): Promise<void> {
    await apiCall('/api/iot/session/end', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
  },

  /**
   * Update session supervisors
   * Endpoint: PUT /api/iot/session/{sessionId}/supervisors
   */
  async updateSessionSupervisors(
    pin: string,
    sessionId: number,
    supervisorIds: number[]
  ): Promise<{ supervisors: SupervisorInfo[] }> {
    const response = await apiCall<{
      status: string;
      data: {
        active_group_id: number;
        supervisors: SupervisorInfo[];
        status: string;
        message: string;
      };
      message?: string;
    }>(`/api/iot/session/${sessionId}/supervisors`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({ supervisor_ids: supervisorIds }),
    });

    return { supervisors: response.data.supervisors };
  },

  /**
   * Get students supervised by specified teachers
   * Endpoint: GET /api/iot/students?teacher_ids=1,2,3
   */
  async getStudents(pin: string, teacherIds: number[]): Promise<Student[]> {
    // Create query parameter string
    const queryParam = teacherIds.length > 0 ? `?teacher_ids=${teacherIds.join(',')}` : '';

    const response = await apiCall<{
      status: string;
      data: Student[];
      message: string;
    }>(`/api/iot/students${queryParam}`, {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Check RFID tag assignment status
   * Endpoint: GET /api/iot/rfid/{tagId}
   */
  async checkTagAssignment(pin: string, tagId: string): Promise<TagAssignmentCheck> {
    try {
      const response = await apiCall<{
        status: string;
        message: string;
        data: TagAssignmentCheck;
      }>(`/api/iot/rfid/${tagId}`, {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means tag is not assigned, which is fine
      if (errorMessage.includes('404')) {
        return { assigned: false };
      }
      throw error;
    }
  },

  /**
   * Assign RFID tag to student
   * Endpoint: POST /api/students/{studentId}/rfid
   */
  async assignTag(pin: string, studentId: number, tagId: string): Promise<TagAssignmentResult> {
    const response = await apiCall<{
      status: string;
      data?: {
        success: boolean;
        student_id: number;
        student_name: string;
        rfid_tag: string;
        previous_tag?: string;
        message?: string;
      };
      message?: string;
    }>(`/api/students/${studentId}/rfid`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({
        rfid_tag: tagId,
      }),
    });

    // Transform the API response to match our expected TagAssignmentResult interface
    return {
      success: response.data?.success ?? response.status === 'success',
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      student_id: response.data?.student_id,
      student_name: response.data?.student_name,
      rfid_tag: response.data?.rfid_tag,
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Assign RFID tag to staff member
   * Endpoint: POST /api/iot/staff/{staffId}/rfid
   */
  async assignStaffTag(pin: string, staffId: number, tagId: string): Promise<TagAssignmentResult> {
    const response = await apiCall<{
      status: string;
      data?: {
        success: boolean;
        staff_id: number;
        staff_name: string;
        rfid_tag: string;
        previous_tag?: string;
        message?: string;
      };
      message?: string;
    }>(`/api/iot/staff/${staffId}/rfid`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
        'X-Staff-ID': staffId.toString(),
      },
      body: JSON.stringify({
        rfid_tag: tagId,
      }),
    });

    return {
      success: response.data?.success ?? response.status === 'success',
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      student_id: response.data?.staff_id,
      student_name: response.data?.staff_name,
      rfid_tag: response.data?.rfid_tag,
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Remove RFID tag from staff member
   * Endpoint: DELETE /api/iot/staff/{staffId}/rfid
   */
  async unassignStaffTag(pin: string, staffId: number): Promise<void> {
    await apiCall(`/api/iot/staff/${staffId}/rfid`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
        'X-Staff-ID': staffId.toString(),
      },
    });
  },

  /**
   * Process RFID check-in/check-out
   * Endpoint: POST /api/iot/checkin
   */
  async processRfidScan(
    scanData: {
      student_rfid: string;
      action: 'checkin' | 'checkout';
      room_id: number;
    },
    pin: string
  ): Promise<RfidScanResult> {
    const response = await apiCall<{
      data: RfidScanResult;
      message: string;
      status: string;
    }>('/api/iot/checkin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(scanData),
    });

    // Extract the actual data from the nested response
    return response.data;
  },

  /**
   * Update session activity to prevent timeout
   * Endpoint: POST /api/iot/session/activity
   */
  async updateSessionActivity(pin: string): Promise<void> {
    await apiCall('/api/iot/session/activity', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({
        activity_type: 'rfid_scan', // Changed from 'student_scan' to 'rfid_scan'
        timestamp: new Date().toISOString(),
      }),
    });
  },

  /**
   * Get current session information including active student count
   * Endpoint: GET /api/iot/session/current
   */
  async getCurrentSessionInfo(
    pin: string
  ): Promise<{ activity_name: string; room_name: string; active_students: number } | null> {
    try {
      const response = await apiCall<{
        status: string;
        data: CurrentSession | { device_id: number; is_active: false };
        message: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.debug('getCurrentSessionInfo response', { response });

      // Check if we have an active session
      if ('is_active' in response.data && response.data.is_active === false) {
        return null;
      }

      // Map the CurrentSession to the simplified format expected by the UI
      const session = response.data;
      return {
        activity_name: session.activity_name ?? 'Unknown Activity',
        room_name: session.room_name ?? 'Unknown Room',
        active_students: session.active_students ?? 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means no current session
      if (errorMessage.includes('404')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get student attendance status
   * Endpoint: GET /api/iot/attendance/status/{rfid}
   */
  async getAttendanceStatus(pin: string, rfid: string): Promise<AttendanceStatusResponse> {
    try {
      const response = await apiCall<AttendanceStatusResponse>(
        `/api/iot/attendance/status/${rfid}`,
        {
          headers: {
            Authorization: `Bearer ${DEVICE_API_KEY}`,
            'X-Staff-PIN': pin,
          },
        }
      );

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(mapAttendanceErrorToGerman(errorMessage, 'status'));
    }
  },

  /**
   * Toggle student attendance (check-in/check-out)
   * Endpoint: POST /api/iot/attendance/toggle
   */
  async toggleAttendance(
    pin: string,
    rfid: string,
    action: 'confirm' | 'cancel' | 'confirm_daily_checkout',
    destination?: 'zuhause' | 'unterwegs'
  ): Promise<AttendanceToggleResponse> {
    try {
      const body: { rfid: string; action: string; destination?: string } = {
        rfid,
        action,
      };

      // Add destination for confirm_daily_checkout action
      if (action === 'confirm_daily_checkout' && destination) {
        body.destination = destination;
      }

      const response = await apiCall<AttendanceToggleResponse>('/api/iot/attendance/toggle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
        body: JSON.stringify(body),
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(mapAttendanceErrorToGerman(errorMessage, 'toggle'));
    }
  },

  /**
   * Submit daily feedback when student checks out for the day
   * Endpoint: POST /api/iot/feedback
   */
  async submitDailyFeedback(
    pin: string,
    feedback: DailyFeedbackRequest
  ): Promise<DailyFeedbackResponse> {
    try {
      const response = await apiCall<DailyFeedbackResponse>('/api/iot/feedback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
        body: JSON.stringify(feedback),
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(mapAttendanceErrorToGerman(errorMessage, 'feedback'));
    }
  },
};

/**
 * Student data structure from /api/iot/students
 */
export interface Student {
  student_id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  school_class: string;
  group_name: string;
  rfid_tag?: string;
}

/**
 * Tag assignment check response from /api/iot/rfid/{tagId}
 */
export interface TagAssignmentCheck {
  assigned: boolean;
  person_type?: 'student' | 'staff';
  person?: {
    id: number;
    person_id: number;
    name: string;
    group: string;
  };
}

/**
 * Tag assignment result from POST /api/students/{studentId}/rfid
 */
export interface TagAssignmentResult {
  success: boolean;
  student_id?: number;
  student_name?: string;
  rfid_tag?: string;
  previous_tag?: string;
  message?: string;
}

/**
 * RFID scan result from POST /api/iot/checkin
 */
export interface RfidScanResult {
  student_id: number | null;
  student_name: string;
  action:
    | 'checked_in'
    | 'checked_out'
    | 'pending_daily_checkout'
    | 'transferred'
    | 'supervisor_authenticated'
    | 'error'
    | 'already_in';
  greeting?: string;
  visit_id?: number;
  room_name?: string;
  previous_room?: string;
  processed_at?: string;
  message?: string;
  status?: string;
  /** Indicates this result should be displayed as an error state */
  showAsError?: boolean;
  /** Indicates this result is informational (not a scan result) */
  isInfo?: boolean;
  /** The RFID tag that was scanned (added by frontend, not from server) */
  scannedTagId?: string;
}

/**
 * Attendance status response from GET /api/iot/attendance/status/{rfid}
 */
export interface AttendanceStatusResponse {
  status: string;
  data: {
    student: {
      id: number;
      first_name: string;
      last_name: string;
      group: {
        id: number;
        name: string;
      };
    };
    attendance: {
      status: 'checked_in' | 'checked_out' | 'not_checked_in';
      date: string;
      check_in_time: string | null;
      check_out_time: string | null;
      checked_in_by: string;
      checked_out_by: string;
    };
  };
  message: string;
}

/**
 * Attendance toggle response from POST /api/iot/attendance/toggle
 */
export interface AttendanceToggleResponse {
  status: string;
  data: {
    action: 'checked_in' | 'checked_out' | 'cancelled';
    student: {
      id: number;
      first_name: string;
      last_name: string;
      group: {
        id: number;
        name: string;
      };
    };
    attendance: {
      status: 'checked_in' | 'checked_out' | '';
      date: string;
      check_in_time: string | null;
      check_out_time: string | null;
      checked_in_by: string;
      checked_out_by: string;
    };
    message: string;
  };
  message: string;
}

/**
 * Daily feedback rating type - matches backend enum validation
 */
export type DailyFeedbackRating = 'positive' | 'neutral' | 'negative';

/**
 * Feedback submission request for POST /api/iot/feedback
 */
export interface DailyFeedbackRequest {
  student_id: number;
  value: DailyFeedbackRating;
}

/**
 * Feedback submission response from POST /api/iot/feedback
 */
export interface DailyFeedbackResponse {
  status: string;
  message: string;
  data?: {
    id: number;
    student_id: number;
    value: string;
    day: string; // "2025-10-12"
    time: string; // "15:30:45"
    created_at: string; // ISO 8601
  };
}
