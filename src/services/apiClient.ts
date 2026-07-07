/**
 * HTTP client for the PyrePortal API.
 * Holds runtime configuration, performs authenticated fetches and reports
 * network quality to the registered callback.
 */

import { adapter } from '@platform';

import { createLogger } from '../utils/logger';

import { ApiError, type ApiErrorResponse } from './apiErrors';

const logger = createLogger('API');

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
 * Initialize API configuration via platform adapter
 */
export async function initializeApi(): Promise<void> {
  if (isInitialized) {
    return;
  }

  await adapter.loadConfig();
  API_BASE_URL = adapter.getApiBaseUrl();
  DEVICE_API_KEY = adapter.getDeviceApiKey();
  isInitialized = true;

  logger.info('API initialized with platform configuration', {
    platform: adapter.platform,
    baseUrl: API_BASE_URL,
    hasApiKey: !!DEVICE_API_KEY,
  });
}

/**
 * Returns the configured API base URL (empty string before initialization).
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Returns whether a device API key is configured (empty string before initialization).
 */
export function hasDeviceApiKey(): boolean {
  return !!DEVICE_API_KEY;
}

/**
 * Build the standard authentication headers for API requests.
 * Always includes the device Authorization header; adds X-Staff-PIN and
 * X-Staff-ID when the corresponding values are provided.
 */
export function buildAuthHeaders(pin?: string, staffId?: number): Record<string, string> {
  return {
    Authorization: `Bearer ${DEVICE_API_KEY}`,
    ...(pin !== undefined && { 'X-Staff-PIN': pin }),
    ...(staffId !== undefined && { 'X-Staff-ID': staffId.toString() }),
  };
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

/**
 * Generic API call function with error handling and response timing
 */
export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  await ensureInitialized();

  const url = `${API_BASE_URL}${endpoint}`;
  const startTime = Date.now();

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

  logger.debug('API request completed', {
    endpoint,
    status: response.status,
    responseTime,
    quality: responseTime < POOR_THRESHOLD_MS ? 'online' : 'poor',
  });

  reportNetworkStatus(responseTime, true);

  return response.json() as Promise<T>;
}
