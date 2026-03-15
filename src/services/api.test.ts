import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  formatRoomName,
  isNetworkRelatedError,
  mapApiErrorToGerman,
  mapServerErrorToGerman,
  setNetworkStatusCallback,
} from './api';

// ====================================================================
// Helpers
// ====================================================================

/**
 * Create a mock Response object for fetch
 */
function mockResponse(
  body: unknown,
  init: { status?: number; statusText?: string; ok?: boolean } = {}
): Response {
  const { status = 200, statusText = 'OK', ok = status >= 200 && status < 300 } = init;
  return {
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(body, init),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  };
}

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

  // Additional mappings for coverage
  it('maps device API key is required', () => {
    expect(mapServerErrorToGerman('device API key is required')).toBe(
      'API-Schlüssel nicht konfiguriert. Bitte .env Datei prüfen.'
    );
  });

  it('maps invalid API key format', () => {
    expect(mapServerErrorToGerman('invalid API key format')).toBe(
      'API-Schlüssel Format ungültig. Bearer Token erwartet.'
    );
  });

  it('maps staff PIN is required', () => {
    expect(mapServerErrorToGerman('staff PIN is required')).toBe('PIN nicht angegeben.');
  });

  it('maps device is offline', () => {
    expect(mapServerErrorToGerman('device is offline')).toBe(
      'Gerät ist als offline markiert. Bitte Administrator kontaktieren.'
    );
  });

  it('maps no active session', () => {
    expect(mapServerErrorToGerman('no active session')).toBe(
      'Keine aktive Sitzung. Bitte zuerst eine Aktivität starten.'
    );
  });

  it('maps invalid session ID', () => {
    expect(mapServerErrorToGerman('invalid session ID')).toBe('Ungültige Sitzungs-ID.');
  });

  it('maps RFID parameter is required', () => {
    expect(mapServerErrorToGerman('RFID parameter is required')).toBe(
      'RFID-Tag fehlt in der Anfrage.'
    );
  });

  it('maps 403/Forbidden', () => {
    expect(mapServerErrorToGerman('Forbidden')).toBe('Keine Berechtigung für diese Aktion.');
  });

  it('maps 409/Conflict', () => {
    expect(mapServerErrorToGerman('Conflict')).toBe(
      'Konflikt bei der Anfrage. Bitte erneut versuchen.'
    );
  });

  it('maps 400/Bad Request', () => {
    expect(mapServerErrorToGerman('Bad Request')).toBe('Ungültige Anfrage. Bitte Eingaben prüfen.');
  });

  it('maps 503 Service Unavailable', () => {
    expect(mapServerErrorToGerman('Service Unavailable')).toBe(
      'Server nicht erreichbar. Bitte später versuchen.'
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

  it('handles activity capacity details without activity_name', () => {
    const error = new ApiError('capacity', 409, 'ACTIVITY_CAPACITY_EXCEEDED', {
      max_participants: 15,
    });
    // No activity_name → falls back to generic message
    expect(mapApiErrorToGerman(error)).toBe(
      'Aktivität ist voll. Maximale Teilnehmerzahl erreicht.'
    );
  });

  it('handles room capacity details without room_name', () => {
    const error = new ApiError('capacity', 409, 'ROOM_CAPACITY_EXCEEDED', {
      max_capacity: 25,
    });
    // No room_name → falls back to generic message
    expect(mapApiErrorToGerman(error)).toBe('Raum ist voll. Kein Platz mehr verfügbar.');
  });

  it('handles room capacity with numeric room_name', () => {
    const error = new ApiError('capacity', 409, 'ROOM_CAPACITY_EXCEEDED', {
      room_name: 'Raum 5' as string,
      current_occupancy: 10,
      max_capacity: 10,
    });
    expect(mapApiErrorToGerman(error)).toBe('Raum 5 ist voll (10/10 Plätze belegt).');
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

// ====================================================================
// initializeApi
// ====================================================================

describe('initializeApi', () => {
  // We need to re-import the module to reset isInitialized state.
  // Since the module-level `isInitialized` persists, we use vi.resetModules().

  it('loads config from Tauri backend via safeInvoke', async () => {
    // Use a fresh module to ensure isInitialized = false
    vi.resetModules();
    const { initializeApi: freshInit } = await import('./api');
    const { safeInvoke: freshSafeInvoke } = await import('../utils/tauriContext');
    const mockedInvoke = vi.mocked(freshSafeInvoke);

    mockedInvoke.mockResolvedValueOnce({
      api_base_url: 'http://test.local',
      device_api_key: 'key-abc',
    });

    await freshInit();
    expect(mockedInvoke).toHaveBeenCalledWith('get_api_config');
  });

  it('skips re-initialization if already initialized', async () => {
    vi.resetModules();
    const { initializeApi: freshInit } = await import('./api');
    const { safeInvoke: freshSafeInvoke } = await import('../utils/tauriContext');
    const mockedInvoke = vi.mocked(freshSafeInvoke);

    mockedInvoke.mockResolvedValueOnce({
      api_base_url: 'http://test.local',
      device_api_key: 'key-abc',
    });

    await freshInit();
    await freshInit(); // second call should be a no-op
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it('falls back to VITE env vars when Tauri is not available', async () => {
    vi.resetModules();

    // Set VITE env vars for fallback
    const originalEnv = { ...import.meta.env };
    import.meta.env.VITE_API_BASE_URL = 'http://vite-fallback.local';
    import.meta.env.VITE_DEVICE_API_KEY = 'vite-key-123';

    const { initializeApi: freshInit } = await import('./api');
    const { safeInvoke: freshSafeInvoke } = await import('../utils/tauriContext');
    const mockedInvoke = vi.mocked(freshSafeInvoke);

    mockedInvoke.mockRejectedValueOnce(new Error('Tauri not available'));

    await freshInit();
    // Should not throw since VITE_DEVICE_API_KEY is set

    // Cleanup
    Object.assign(import.meta.env, originalEnv);
    delete import.meta.env.VITE_API_BASE_URL;
    delete import.meta.env.VITE_DEVICE_API_KEY;
  });

  it('throws when Tauri fails and no VITE_DEVICE_API_KEY', async () => {
    vi.resetModules();

    // Ensure VITE_DEVICE_API_KEY is not set
    const savedKey = import.meta.env.VITE_DEVICE_API_KEY as string | undefined;
    delete import.meta.env.VITE_DEVICE_API_KEY;
    (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL = undefined;

    const { initializeApi: freshInit } = await import('./api');
    const { safeInvoke: freshSafeInvoke } = await import('../utils/tauriContext');
    const mockedInvoke = vi.mocked(freshSafeInvoke);

    mockedInvoke.mockRejectedValueOnce(new Error('Tauri not available'));

    await expect(freshInit()).rejects.toThrow('API key not found');

    // Cleanup
    if (savedKey !== undefined) {
      (import.meta.env as Record<string, string>).VITE_DEVICE_API_KEY = savedKey;
    }
  });
});

// ====================================================================
// API methods (api.*, apiCall, handleNetworkError, parseErrorResponse,
//              reportNetworkStatus, ensureInitialized, mapAttendanceErrorToGerman)
// ====================================================================

describe('api methods', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset modules to get fresh state with isInitialized = false
    vi.resetModules();

    // Set up global fetch mock
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    setNetworkStatusCallback(null);
  });

  /**
   * Helper: get fresh api + initializeApi from a clean module,
   * with safeInvoke already configured to return valid config.
   */
  async function getFreshApi() {
    const apiModule = await import('./api');
    const tauriModule = await import('../utils/tauriContext');
    const mockedInvoke = vi.mocked(tauriModule.safeInvoke);

    mockedInvoke.mockResolvedValueOnce({
      api_base_url: 'http://test-api.local',
      device_api_key: 'test-key-123',
    });

    return { ...apiModule, mockedInvoke };
  }

  // ------------------------------------------------------------------
  // reportNetworkStatus (tested indirectly through apiCall)
  // ------------------------------------------------------------------

  describe('reportNetworkStatus via apiCall', () => {
    it('reports online status on fast successful API call', async () => {
      const { api: freshApi, setNetworkStatusCallback: freshSetCb } = await getFreshApi();

      const cb = vi.fn();
      freshSetCb(cb);

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      await freshApi.getTeachers();

      expect(cb).toHaveBeenCalledWith('online', expect.any(Number));
    });

    it('reports offline status on network error', async () => {
      const { api: freshApi, setNetworkStatusCallback: freshSetCb } = await getFreshApi();

      const cb = vi.fn();
      freshSetCb(cb);

      const fetchError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(fetchError);

      await expect(freshApi.getTeachers()).rejects.toThrow();

      expect(cb).toHaveBeenCalledWith('offline', expect.any(Number));
    });

    it('does not call callback when not registered', async () => {
      const { api: freshApi, setNetworkStatusCallback: freshSetCb } = await getFreshApi();

      freshSetCb(null);

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      // Should not throw even without callback
      await freshApi.getTeachers();
    });
  });

  // ------------------------------------------------------------------
  // apiCall — success path
  // ------------------------------------------------------------------

  describe('apiCall success path', () => {
    it('returns parsed JSON on success', async () => {
      const { api: freshApi } = await getFreshApi();

      const teachers = [
        {
          staff_id: 1,
          person_id: 10,
          first_name: 'Anna',
          last_name: 'Schmidt',
          display_name: 'A. Schmidt',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: teachers, message: 'ok' })
      );

      const result = await freshApi.getTeachers();
      expect(result).toEqual(teachers);
    });

    it('passes correct headers including Content-Type and Authorization', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      await freshApi.getTeachers();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://test-api.local/api/iot/teachers');
      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toContain('Bearer');
    });
  });

  // ------------------------------------------------------------------
  // apiCall — error path (parseErrorResponse)
  // ------------------------------------------------------------------

  describe('apiCall error handling', () => {
    it('throws ApiError with parsed JSON error response', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'invalid staff PIN', code: 'AUTH_FAILED' },
          { status: 401, statusText: 'Unauthorized', ok: false }
        )
      );

      try {
        await freshApi.getTeachers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('ApiError');
        const apiErr = error as ApiError;
        expect(apiErr.statusCode).toBe(401);
        expect(apiErr.message).toContain('invalid staff PIN');
        expect(apiErr.code).toBe('AUTH_FAILED');
      }
    });

    it('throws ApiError with base message when JSON parsing fails', async () => {
      const { api: freshApi } = await getFreshApi();

      // Response where json() throws
      const badResponse = mockResponse(null, {
        status: 500,
        statusText: 'Internal Server Error',
        ok: false,
      });
      (badResponse as { json: () => Promise<unknown> }).json = () =>
        Promise.reject(new Error('Not JSON'));
      mockFetch.mockResolvedValueOnce(badResponse);

      try {
        await freshApi.getTeachers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('ApiError');
        const apiErr = error as ApiError;
        expect(apiErr.statusCode).toBe(500);
        expect(apiErr.message).toContain('API Error: 500');
      }
    });

    it('includes error details in ApiError when present', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            status: 'error',
            message: 'Room capacity exceeded',
            code: 'ROOM_CAPACITY_EXCEEDED',
            details: { room_name: 'Turnhalle', max_capacity: 30, current_occupancy: 30 },
          },
          { status: 409, statusText: 'Conflict', ok: false }
        )
      );

      try {
        await freshApi.getTeachers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('ApiError');
        const apiErr = error as ApiError;
        expect(apiErr.code).toBe('ROOM_CAPACITY_EXCEEDED');
        expect(apiErr.details).toEqual({
          room_name: 'Turnhalle',
          max_capacity: 30,
          current_occupancy: 30,
        });
      }
    });

    it('uses error field when message is absent', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', error: 'something went wrong' },
          { status: 400, statusText: 'Bad Request', ok: false }
        )
      );

      try {
        await freshApi.getTeachers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('ApiError');
        const apiErr = error as ApiError;
        expect(apiErr.message).toContain('something went wrong');
      }
    });

    it('uses base message when neither message nor error field present', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'error' }, { status: 400, statusText: 'Bad Request', ok: false })
      );

      try {
        await freshApi.getTeachers();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('ApiError');
        const apiErr = error as ApiError;
        expect(apiErr.message).toBe('API Error: 400 - Bad Request');
      }
    });
  });

  // ------------------------------------------------------------------
  // handleNetworkError (tested indirectly through apiCall)
  // ------------------------------------------------------------------

  describe('handleNetworkError', () => {
    it('throws German message for TypeError with fetch', async () => {
      const { api: freshApi } = await getFreshApi();

      const fetchError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(fetchError);

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Keine Netzwerkverbindung. Bitte WLAN prüfen.'
      );
    });

    it('throws German message for AbortError', async () => {
      const { api: freshApi } = await getFreshApi();

      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Zeitüberschreitung. Server antwortet nicht.'
      );
    });

    it('throws German message for NetworkError', async () => {
      const { api: freshApi } = await getFreshApi();

      const networkError = new Error('NetworkError when attempting to fetch resource');
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Netzwerkfehler. Bitte Verbindung prüfen.'
      );
    });

    it('throws generic German message for other errors', async () => {
      const { api: freshApi } = await getFreshApi();

      const otherError = new Error('Something weird happened');
      mockFetch.mockRejectedValueOnce(otherError);

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Verbindungsfehler. Bitte Netzwerkverbindung prüfen.'
      );
    });

    it('converts non-Error to Error for network errors', async () => {
      const { api: freshApi } = await getFreshApi();

      // Pass a string instead of Error
      mockFetch.mockRejectedValueOnce('some string error');

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Verbindungsfehler. Bitte Netzwerkverbindung prüfen.'
      );
    });

    it('throws German message for error containing "network"', async () => {
      const { api: freshApi } = await getFreshApi();

      const networkError = new Error('A network issue occurred');
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(freshApi.getTeachers()).rejects.toThrow(
        'Netzwerkfehler. Bitte Verbindung prüfen.'
      );
    });
  });

  // ------------------------------------------------------------------
  // api.getTeachers
  // ------------------------------------------------------------------

  describe('api.getTeachers', () => {
    it('returns teacher array from response.data', async () => {
      const { api: freshApi } = await getFreshApi();

      const teachers = [
        {
          staff_id: 1,
          person_id: 10,
          first_name: 'Anna',
          last_name: 'Schmidt',
          display_name: 'A. Schmidt',
        },
        {
          staff_id: 2,
          person_id: 20,
          first_name: 'Max',
          last_name: 'Müller',
          display_name: 'M. Müller',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: teachers, message: 'ok' })
      );

      const result = await freshApi.getTeachers();
      expect(result).toEqual(teachers);
      expect(result).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------
  // api.validateGlobalPin
  // ------------------------------------------------------------------

  describe('api.validateGlobalPin', () => {
    it('returns success result on valid PIN', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', message: 'pong' }));

      const result = await freshApi.validateGlobalPin('1234');
      expect(result.success).toBe(true);
      expect(result.userData?.staffName).toBe('OGS Global User');
      expect(result.userData?.staffId).toBe(0);
      expect(result.userData?.deviceName).toBe('OGS Device');
    });

    it('returns failure result on invalid PIN', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'invalid staff PIN' },
          { status: 401, statusText: 'Unauthorized', ok: false }
        )
      );

      const result = await freshApi.validateGlobalPin('9999');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Ungültiger PIN. Bitte erneut versuchen.');
    });

    it('returns failure on network error', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await freshApi.validateGlobalPin('1234');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('sends correct headers', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', message: 'pong' }));

      await freshApi.validateGlobalPin('5678');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe('POST');
      expect((options.headers as Record<string, string>)['X-Staff-PIN']).toBe('5678');
    });
  });

  // ------------------------------------------------------------------
  // api.validateTeacherPin
  // ------------------------------------------------------------------

  describe('api.validateTeacherPin', () => {
    it('returns success result with staff data', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            device: { id: 1, device_id: 'dev-1', name: 'Pi-1', status: 'active' },
            staff: { id: 5, person_id: 50 },
            person: { first_name: 'Anna', last_name: 'Schmidt' },
            authenticated_at: '2025-01-01T00:00:00Z',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.validateTeacherPin('1234', 5);
      expect(result.success).toBe(true);
      expect(result.userData?.staffName).toBe('Anna Schmidt');
      expect(result.userData?.staffId).toBe(5);
      expect(result.userData?.deviceName).toBe('Pi-1');
    });

    it('returns failure with isLocked when account is locked', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'staff account is locked due to failed PIN attempts' },
          { status: 423, statusText: 'Locked', ok: false }
        )
      );

      const result = await freshApi.validateTeacherPin('wrong', 5);
      expect(result.success).toBe(false);
      expect(result.isLocked).toBe(true);
    });

    it('handles unexpected response structure', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            // Missing device, person, staff
          },
          message: 'ok',
        })
      );

      const result = await freshApi.validateTeacherPin('1234', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unerwartete Server-Antwort');
    });

    it('handles error with 423 status code in message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'API Error: 423 - locked' },
          { status: 423, statusText: 'Locked', ok: false }
        )
      );

      const result = await freshApi.validateTeacherPin('wrong', 5);
      expect(result.success).toBe(false);
      expect(result.isLocked).toBe(true);
    });

    it('handles network error in validateTeacherPin', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await freshApi.validateTeacherPin('1234', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles missing device name and person names', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            device: { id: 1, device_id: 'dev-1', name: '', status: 'active' },
            staff: { id: 5, person_id: 50 },
            person: { first_name: '', last_name: '' },
            authenticated_at: '2025-01-01T00:00:00Z',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.validateTeacherPin('1234', 5);
      expect(result.success).toBe(true);
      expect(result.userData?.staffName).toBe('');
      expect(result.userData?.deviceName).toBe('Unknown Device');
    });

    it('sends X-Staff-ID header', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            device: { id: 1, device_id: 'dev-1', name: 'Pi-1', status: 'active' },
            staff: { id: 42, person_id: 50 },
            person: { first_name: 'Max', last_name: 'Müller' },
            authenticated_at: '2025-01-01T00:00:00Z',
          },
          message: 'ok',
        })
      );

      await freshApi.validateTeacherPin('1234', 42);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['X-Staff-ID']).toBe('42');
    });
  });

  // ------------------------------------------------------------------
  // api.getActivities
  // ------------------------------------------------------------------

  describe('api.getActivities', () => {
    it('returns activities array', async () => {
      const { api: freshApi } = await getFreshApi();

      const activities = [
        { id: 1, name: 'Fußball AG', category: 'sport' },
        { id: 2, name: 'Kunst AG', category: 'kreativ' },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: activities, message: 'ok' })
      );

      const result = await freshApi.getActivities('1234');
      expect(result).toEqual(activities);
    });
  });

  // ------------------------------------------------------------------
  // api.healthCheck
  // ------------------------------------------------------------------

  describe('api.healthCheck', () => {
    it('succeeds on 200 response', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse('OK'));

      await expect(freshApi.healthCheck()).resolves.toBeUndefined();
    });

    it('throws on non-ok response', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse('', { status: 503, statusText: 'Service Unavailable', ok: false })
      );

      await expect(freshApi.healthCheck()).rejects.toThrow('Health check failed: 503');
    });
  });

  // ------------------------------------------------------------------
  // api.pingDevice
  // ------------------------------------------------------------------

  describe('api.pingDevice', () => {
    it('sends POST to /api/iot/ping', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', message: 'pong' }));

      await freshApi.pingDevice('1234');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/ping',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  // ------------------------------------------------------------------
  // api.getRooms
  // ------------------------------------------------------------------

  describe('api.getRooms', () => {
    it('returns rooms array without capacity param', async () => {
      const { api: freshApi } = await getFreshApi();

      const rooms = [{ id: 1, name: 'Turnhalle', is_occupied: false }];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: rooms, message: 'ok' })
      );

      const result = await freshApi.getRooms('1234');
      expect(result).toEqual(rooms);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/rooms/available',
        expect.any(Object)
      );
    });

    it('includes capacity query param when provided', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      await freshApi.getRooms('1234', 20);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/rooms/available?capacity=20',
        expect.any(Object)
      );
    });
  });

  // ------------------------------------------------------------------
  // api.startSession
  // ------------------------------------------------------------------

  describe('api.startSession', () => {
    it('sends session start request and returns response data', async () => {
      const { api: freshApi } = await getFreshApi();

      const sessionData = {
        active_group_id: 1,
        activity_id: 5,
        device_id: 10,
        start_time: '2025-01-01T10:00:00Z',
        supervisors: [],
        status: 'active',
        message: 'Session started',
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: sessionData, message: 'ok' })
      );

      const result = await freshApi.startSession('1234', {
        activity_id: 5,
        supervisor_ids: [1, 2],
        room_id: 3,
      });

      expect(result).toEqual(sessionData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/session/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            activity_id: 5,
            supervisor_ids: [1, 2],
            room_id: 3,
          }),
        })
      );
    });
  });

  // ------------------------------------------------------------------
  // api.getCurrentSession
  // ------------------------------------------------------------------

  describe('api.getCurrentSession', () => {
    it('returns session data when active', async () => {
      const { api: freshApi } = await getFreshApi();

      const session = {
        active_group_id: 1,
        activity_id: 5,
        activity_name: 'Fußball AG',
        device_id: 10,
        start_time: '2025-01-01T10:00:00Z',
        duration: '1h30m',
        is_active: true,
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: session, message: 'ok' })
      );

      const result = await freshApi.getCurrentSession('1234');
      expect(result).toEqual(session);
    });

    it('returns null when session is not active', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: { device_id: 10, is_active: false },
          message: 'ok',
        })
      );

      const result = await freshApi.getCurrentSession('1234');
      expect(result).toBeNull();
    });

    it('returns null on 404 error', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'not found' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      const result = await freshApi.getCurrentSession('1234');
      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'server error' },
          { status: 500, statusText: 'Internal Server Error', ok: false }
        )
      );

      await expect(freshApi.getCurrentSession('1234')).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------
  // api.endSession
  // ------------------------------------------------------------------

  describe('api.endSession', () => {
    it('sends POST to /api/iot/session/end', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', message: 'session ended' })
      );

      await freshApi.endSession('1234');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/session/end',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ------------------------------------------------------------------
  // api.updateSessionSupervisors
  // ------------------------------------------------------------------

  describe('api.updateSessionSupervisors', () => {
    it('sends PUT request and returns supervisors', async () => {
      const { api: freshApi } = await getFreshApi();

      const supervisors = [
        {
          staff_id: 1,
          first_name: 'Anna',
          last_name: 'Schmidt',
          display_name: 'A. Schmidt',
          role: 'teacher',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            active_group_id: 1,
            supervisors,
            status: 'updated',
            message: 'ok',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.updateSessionSupervisors('1234', 1, [1]);
      expect(result.supervisors).toEqual(supervisors);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/session/1/supervisors',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ supervisor_ids: [1] }),
        })
      );
    });
  });

  // ------------------------------------------------------------------
  // api.getStudents
  // ------------------------------------------------------------------

  describe('api.getStudents', () => {
    it('returns students with teacher_ids query param', async () => {
      const { api: freshApi } = await getFreshApi();

      const students = [
        {
          student_id: 1,
          person_id: 100,
          first_name: 'Lena',
          last_name: 'Müller',
          school_class: '3a',
          group_name: 'Gruppe A',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: students, message: 'ok' })
      );

      const result = await freshApi.getStudents('1234', [1, 2]);
      expect(result).toEqual(students);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/students?teacher_ids=1,2',
        expect.any(Object)
      );
    });

    it('omits teacher_ids param when empty array', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      await freshApi.getStudents('1234', []);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/students',
        expect.any(Object)
      );
    });
  });

  // ------------------------------------------------------------------
  // api.checkTagAssignment
  // ------------------------------------------------------------------

  describe('api.checkTagAssignment', () => {
    it('returns tag assignment data', async () => {
      const { api: freshApi } = await getFreshApi();

      const tagData = {
        assigned: true,
        person_type: 'student',
        person: { id: 1, person_id: 100, name: 'Lena Müller', group: 'Gruppe A' },
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ status: 'success', data: tagData, message: 'ok' })
      );

      const result = await freshApi.checkTagAssignment('1234', 'AA:BB:CC:DD');
      expect(result).toEqual(tagData);
    });

    it('returns unassigned on 404 error', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'not found' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      const result = await freshApi.checkTagAssignment('1234', 'XX:YY');
      expect(result).toEqual({ assigned: false });
    });

    it('rethrows non-404 errors', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'server error' },
          { status: 500, statusText: 'Internal Server Error', ok: false }
        )
      );

      await expect(freshApi.checkTagAssignment('1234', 'AA:BB')).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------
  // api.assignTag
  // ------------------------------------------------------------------

  describe('api.assignTag', () => {
    it('assigns tag and returns result with data', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            success: true,
            student_id: 1,
            student_name: 'Lena Müller',
            rfid_tag: 'AA:BB:CC',
            previous_tag: 'XX:YY:ZZ',
            message: 'Tag assigned',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.assignTag('1234', 1, 'AA:BB:CC');
      expect(result.success).toBe(true);
      expect(result.student_name).toBe('Lena Müller');
      expect(result.previous_tag).toBe('XX:YY:ZZ');
    });

    it('returns fallback values when data is missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          message: 'ok',
        })
      );

      const result = await freshApi.assignTag('1234', 1, 'AA:BB:CC');
      expect(result.success).toBe(true); // falls back to status === 'success'
      expect(result.message).toBe('ok'); // response.message ?? default
    });

    it('returns default message when both data and response message are missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
        })
      );

      const result = await freshApi.assignTag('1234', 1, 'AA:BB:CC');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Tag erfolgreich zugewiesen');
    });
  });

  // ------------------------------------------------------------------
  // api.assignStaffTag
  // ------------------------------------------------------------------

  describe('api.assignStaffTag', () => {
    it('assigns staff tag and returns result', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            success: true,
            staff_id: 5,
            staff_name: 'Anna Schmidt',
            rfid_tag: 'DD:EE:FF',
            message: 'Staff tag assigned',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.assignStaffTag('1234', 5, 'DD:EE:FF');
      expect(result.success).toBe(true);
      expect(result.student_id).toBe(5); // mapped from staff_id
      expect(result.student_name).toBe('Anna Schmidt'); // mapped from staff_name
    });

    it('returns fallback values when data is missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          message: 'ok',
        })
      );

      const result = await freshApi.assignStaffTag('1234', 5, 'DD:EE:FF');
      expect(result.success).toBe(true);
      expect(result.message).toBe('ok'); // response.message ?? default
    });

    it('returns default message when both data and response message are missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
        })
      );

      const result = await freshApi.assignStaffTag('1234', 5, 'DD:EE:FF');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Tag erfolgreich zugewiesen');
    });

    it('sends X-Staff-ID header', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: { success: true, staff_id: 5, staff_name: 'X', rfid_tag: 'Y' },
          message: 'ok',
        })
      );

      await freshApi.assignStaffTag('1234', 5, 'DD:EE:FF');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://test-api.local/api/iot/staff/5/rfid');
      expect((options.headers as Record<string, string>)['X-Staff-ID']).toBe('5');
    });
  });

  // ------------------------------------------------------------------
  // api.unassignStaffTag
  // ------------------------------------------------------------------

  describe('api.unassignStaffTag', () => {
    it('sends DELETE request', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', message: 'ok' }));

      await freshApi.unassignStaffTag('1234', 5);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://test-api.local/api/iot/staff/5/rfid');
      expect(options.method).toBe('DELETE');
      expect((options.headers as Record<string, string>)['X-Staff-ID']).toBe('5');
    });
  });

  // ------------------------------------------------------------------
  // api.unassignStudentTag
  // ------------------------------------------------------------------

  describe('api.unassignStudentTag', () => {
    it('sends DELETE and returns result', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            success: true,
            student_id: 1,
            student_name: 'Lena Müller',
            rfid_tag: 'AA:BB:CC',
            message: 'Tag removed',
          },
          message: 'ok',
        })
      );

      const result = await freshApi.unassignStudentTag('1234', 1);
      expect(result.success).toBe(true);
      expect(result.student_name).toBe('Lena Müller');
      expect(result.message).toBe('Tag removed');
    });

    it('returns fallback values when data is missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          message: 'Tag removed',
        })
      );

      const result = await freshApi.unassignStudentTag('1234', 1);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Tag removed');
    });
  });

  // ------------------------------------------------------------------
  // api.processRfidScan
  // ------------------------------------------------------------------

  describe('api.processRfidScan', () => {
    it('returns scan result for checkin', async () => {
      const { api: freshApi } = await getFreshApi();

      const scanResult = {
        student_id: 1,
        student_name: 'Lena Müller',
        action: 'checked_in',
        greeting: 'Hallo Lena!',
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: scanResult,
          message: 'ok',
        })
      );

      const result = await freshApi.processRfidScan(
        { student_rfid: 'AA:BB:CC', action: 'checkin', room_id: 1 },
        '1234'
      );
      expect(result.student_name).toBe('Lena Müller');
      expect(result.action).toBe('checked_in');
    });

    it('normalizes checked_out_daily to checked_out with daily_checkout_available', async () => {
      const { api: freshApi } = await getFreshApi();

      const scanResult = {
        student_id: 1,
        student_name: 'Max Müller',
        action: 'checked_out_daily',
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: scanResult,
          message: 'ok',
        })
      );

      const result = await freshApi.processRfidScan(
        { student_rfid: 'DD:EE:FF', action: 'checkout', room_id: 1 },
        '1234'
      );
      expect(result.action).toBe('checked_out');
      expect(result.daily_checkout_available).toBe(true);
    });

    it('sends correct body', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: { student_id: 1, student_name: 'Test', action: 'checked_in' },
          message: 'ok',
        })
      );

      await freshApi.processRfidScan(
        { student_rfid: 'AA:BB:CC', action: 'checkin', room_id: 5 },
        '1234'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/checkin',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ student_rfid: 'AA:BB:CC', action: 'checkin', room_id: 5 }),
        })
      );
    });
  });

  // ------------------------------------------------------------------
  // api.updateSessionActivity
  // ------------------------------------------------------------------

  describe('api.updateSessionActivity', () => {
    it('sends POST with activity_type and timestamp', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', message: 'ok' }));

      await freshApi.updateSessionActivity('1234');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.local/api/iot/session/activity',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Verify body contains activity_type
      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(call[1].body as string) as {
        activity_type: string;
        timestamp: string;
      };
      expect(body.activity_type).toBe('rfid_scan');
      expect(body.timestamp).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // api.getCurrentSessionInfo
  // ------------------------------------------------------------------

  describe('api.getCurrentSessionInfo', () => {
    it('returns simplified session info when active', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            active_group_id: 1,
            activity_id: 5,
            activity_name: 'Fußball AG',
            room_name: 'Turnhalle',
            device_id: 10,
            start_time: '2025-01-01T10:00:00Z',
            duration: '1h',
            active_students: 15,
          },
          message: 'ok',
        })
      );

      const result = await freshApi.getCurrentSessionInfo('1234');
      expect(result).toEqual({
        activity_name: 'Fußball AG',
        room_name: 'Turnhalle',
        active_students: 15,
      });
    });

    it('returns null when session is not active', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: { device_id: 10, is_active: false },
          message: 'ok',
        })
      );

      const result = await freshApi.getCurrentSessionInfo('1234');
      expect(result).toBeNull();
    });

    it('returns null on 404 error', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'not found' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      const result = await freshApi.getCurrentSessionInfo('1234');
      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'server error' },
          { status: 500, statusText: 'Internal Server Error', ok: false }
        )
      );

      await expect(freshApi.getCurrentSessionInfo('1234')).rejects.toThrow();
    });

    it('returns defaults when optional session fields are missing', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            active_group_id: 1,
            activity_id: 5,
            device_id: 10,
            start_time: '2025-01-01T10:00:00Z',
            duration: '1h',
            // activity_name, room_name, active_students all missing
          },
          message: 'ok',
        })
      );

      const result = await freshApi.getCurrentSessionInfo('1234');
      expect(result).toEqual({
        activity_name: 'Unknown Activity',
        room_name: 'Unknown Room',
        active_students: 0,
      });
    });
  });

  // ------------------------------------------------------------------
  // api.getAttendanceStatus (mapAttendanceErrorToGerman coverage)
  // ------------------------------------------------------------------

  describe('api.getAttendanceStatus', () => {
    it('returns attendance status on success', async () => {
      const { api: freshApi } = await getFreshApi();

      const attendanceData = {
        status: 'success',
        data: {
          student: {
            id: 1,
            first_name: 'Lena',
            last_name: 'Müller',
            group: { id: 1, name: 'Gruppe A' },
          },
          attendance: {
            status: 'checked_in',
            date: '2025-01-01',
            check_in_time: '08:00:00',
            check_out_time: null,
            checked_in_by: 'staff',
            checked_out_by: '',
          },
        },
        message: 'ok',
      };
      mockFetch.mockResolvedValueOnce(mockResponse(attendanceData));

      const result = await freshApi.getAttendanceStatus('1234', 'AA:BB:CC');
      expect(result.data.student.first_name).toBe('Lena');
    });

    it('maps network error to German in attendance context', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Netzwerkfehler. Bitte Verbindung prüfen.'
      );
    });

    it('maps 404 error to attendance-specific German message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'student not found' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Schüler nicht gefunden.'
      );
    });

    it('maps 403 error to attendance status-specific message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: '403 Forbidden' },
          { status: 403, statusText: 'Forbidden', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Keine Berechtigung für Anwesenheitsstatus dieses Schülers.'
      );
    });

    it('maps 401 error to auth message in attendance context', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: '401 Unauthorized' },
          { status: 401, statusText: 'Unauthorized', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Authentifizierung fehlgeschlagen. Bitte erneut anmelden.'
      );
    });

    it('maps 400 error to bad request message in attendance context', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: '400 Bad Request' },
          { status: 400, statusText: 'Bad Request', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Ungültige Anfrage. Bitte Eingaben prüfen.'
      );
    });

    it('uses specific error mapping for known backend errors', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'invalid staff PIN' },
          { status: 401, statusText: 'Unauthorized', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Ungültiger PIN. Bitte erneut versuchen.'
      );
    });

    it('passes through generic 5xx fallback message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'Internal Server Error' },
          { status: 500, statusText: 'Internal Server Error', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Server nicht erreichbar. Bitte später versuchen.'
      );
    });

    it('maps generic not found 404 to status-specific message', async () => {
      const { api: freshApi } = await getFreshApi();

      // A 404 where the error message contains "404" but no specific mapping
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'something 404 generic' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      await expect(freshApi.getAttendanceStatus('1234', 'AA:BB')).rejects.toThrow(
        'Schüler nicht gefunden oder keine Anwesenheitsdaten für heute verfügbar.'
      );
    });
  });

  // ------------------------------------------------------------------
  // api.toggleAttendance (mapAttendanceErrorToGerman toggle context)
  // ------------------------------------------------------------------

  describe('api.toggleAttendance', () => {
    it('returns toggle response on success', async () => {
      const { api: freshApi } = await getFreshApi();

      const toggleData = {
        status: 'success',
        data: {
          action: 'checked_in',
          student: {
            id: 1,
            first_name: 'Lena',
            last_name: 'Müller',
            group: { id: 1, name: 'Gruppe A' },
          },
          attendance: {
            status: 'checked_in',
            date: '2025-01-01',
            check_in_time: '08:00:00',
            check_out_time: null,
            checked_in_by: 'staff',
            checked_out_by: '',
          },
          message: 'ok',
        },
        message: 'ok',
      };
      mockFetch.mockResolvedValueOnce(mockResponse(toggleData));

      const result = await freshApi.toggleAttendance('1234', 'AA:BB:CC', 'confirm');
      expect(result.data.action).toBe('checked_in');
    });

    it('includes destination for confirm_daily_checkout', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          data: {
            action: 'checked_out',
            student: {
              id: 1,
              first_name: 'Lena',
              last_name: 'Müller',
              group: { id: 1, name: 'A' },
            },
            attendance: {
              status: 'checked_out',
              date: '2025-01-01',
              check_in_time: '08:00:00',
              check_out_time: '15:00:00',
              checked_in_by: 'staff',
              checked_out_by: 'staff',
            },
            message: 'ok',
          },
          message: 'ok',
        })
      );

      await freshApi.toggleAttendance('1234', 'AA:BB:CC', 'confirm_daily_checkout', 'zuhause');

      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(call[1].body as string) as {
        rfid: string;
        action: string;
        destination?: string;
      };
      expect(body.destination).toBe('zuhause');
      expect(body.action).toBe('confirm_daily_checkout');
    });

    it('maps 404 error to toggle-specific German message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'API Error: 404 - some error' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      await expect(freshApi.toggleAttendance('1234', 'AA:BB', 'confirm')).rejects.toThrow(
        'Schüler nicht gefunden. RFID-Tag möglicherweise nicht zugewiesen.'
      );
    });

    it('maps 403 error to toggle-specific German message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: '403 Forbidden access' },
          { status: 403, statusText: 'Forbidden', ok: false }
        )
      );

      await expect(freshApi.toggleAttendance('1234', 'AA:BB', 'confirm')).rejects.toThrow(
        'Keine Berechtigung für An-/Abmeldung dieses Schülers.'
      );
    });
  });

  // ------------------------------------------------------------------
  // api.submitDailyFeedback (mapAttendanceErrorToGerman feedback context)
  // ------------------------------------------------------------------

  describe('api.submitDailyFeedback', () => {
    it('returns feedback response on success', async () => {
      const { api: freshApi } = await getFreshApi();

      const feedbackResponse = {
        status: 'success',
        message: 'Feedback submitted',
        data: {
          id: 1,
          student_id: 1,
          value: 'positive',
          day: '2025-01-01',
          time: '15:00:00',
          created_at: '2025-01-01T15:00:00Z',
        },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(feedbackResponse));

      const result = await freshApi.submitDailyFeedback('1234', {
        student_id: 1,
        value: 'positive',
      });
      expect(result.message).toBe('Feedback submitted');
    });

    it('maps 404 error to feedback-specific German message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'API Error: 404 - generic' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      await expect(
        freshApi.submitDailyFeedback('1234', { student_id: 1, value: 'positive' })
      ).rejects.toThrow('Feedback-Service nicht erreichbar. Bitte später versuchen.');
    });

    it('maps 403 error to feedback-specific German message', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: '403 Forbidden' },
          { status: 403, statusText: 'Forbidden', ok: false }
        )
      );

      await expect(
        freshApi.submitDailyFeedback('1234', { student_id: 1, value: 'negative' })
      ).rejects.toThrow('Keine Berechtigung für Feedback-Übermittlung.');
    });

    it('maps network error in feedback context', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        freshApi.submitDailyFeedback('1234', { student_id: 1, value: 'neutral' })
      ).rejects.toThrow('Netzwerkfehler. Bitte Verbindung prüfen.');
    });
  });

  // ------------------------------------------------------------------
  // ensureInitialized — auto-initialization on first api call
  // ------------------------------------------------------------------

  describe('ensureInitialized', () => {
    it('auto-initializes on first api call', async () => {
      const { api: freshApi, mockedInvoke } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(mockResponse({ status: 'success', data: [], message: 'ok' }));

      await freshApi.getTeachers();

      // safeInvoke should have been called for get_api_config
      expect(mockedInvoke).toHaveBeenCalledWith('get_api_config');
    });
  });
});
