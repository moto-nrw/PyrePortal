import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, isNotFoundError, setNetworkStatusCallback } from './api';

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
    type: 'basic',
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
// isNotFoundError — typed status code detection with string fallback
// ====================================================================

describe('isNotFoundError', () => {
  it('detects ApiError with statusCode 404 even without "404" in the message', () => {
    const error = new ApiError('no session', 404);
    expect(isNotFoundError(error, error.message)).toBe(true);
  });

  it('detects raw Error messages containing "404" (string fallback)', () => {
    const error = new Error('API Error: 404 - Not Found');
    expect(isNotFoundError(error, error.message)).toBe(true);
  });

  it('rejects ApiError with a different status code', () => {
    const error = new ApiError('server exploded', 500);
    expect(isNotFoundError(error, error.message)).toBe(false);
  });

  it('rejects raw errors without "404" in the message', () => {
    const error = new Error('server error');
    expect(isNotFoundError(error, error.message)).toBe(false);
  });
});

// ====================================================================
// api methods using isNotFoundError
// ====================================================================

describe('api methods with 404 status code detection', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset modules to get fresh state with isInitialized = false
    vi.resetModules();

    // Set up global fetch mock
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    setNetworkStatusCallback(null);
  });

  /**
   * Helper: get fresh api from a clean module,
   * with env vars configured for the browser adapter.
   */
  async function getFreshApi() {
    import.meta.env.VITE_API_BASE_URL = 'http://test-api.local';
    import.meta.env.VITE_DEVICE_API_KEY = 'test-key-123';

    const apiModule = await import('./api');

    return { ...apiModule };
  }

  describe('api.getCurrentSession', () => {
    it('returns null when the backend responds with a 404 ApiError', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'no active session for device' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      const result = await freshApi.getCurrentSession('1234');
      expect(result).toBeNull();
    });
  });

  describe('api.checkTagAssignment', () => {
    it('returns { assigned: false } when the backend responds with a 404 ApiError', async () => {
      const { api: freshApi } = await getFreshApi();

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { status: 'error', message: 'tag is not assigned' },
          { status: 404, statusText: 'Not Found', ok: false }
        )
      );

      const result = await freshApi.checkTagAssignment('1234', 'AA:BB:CC:DD');
      expect(result).toEqual({ assigned: false });
    });
  });
});
