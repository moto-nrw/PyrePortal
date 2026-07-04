import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { WebAdapterBase } from './webAdapterBase';

class TestAdapter extends WebAdapterBase {}

describe('WebAdapterBase', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
    window.history.pushState({}, '', '/');
  });

  describe('getDeviceApiKey', () => {
    it('reads the key from the URL and caches it', () => {
      window.history.pushState({}, '', '/?key=test-key-123');
      expect(adapter.getDeviceApiKey()).toBe('test-key-123');

      // Key removed from URL — the cached value is returned
      window.history.pushState({}, '', '/');
      expect(adapter.getDeviceApiKey()).toBe('test-key-123');
    });

    it('throws when no key in URL and no cached key', () => {
      // Isolate from a local .env that may set VITE_DEVICE_API_KEY
      vi.stubEnv('VITE_DEVICE_API_KEY', '');

      expect(() => adapter.getDeviceApiKey()).toThrow('DEVICE_API_KEY not found in URL');

      vi.unstubAllEnvs();
    });

    describe('VITE_DEVICE_API_KEY fallback', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('falls back to VITE_DEVICE_API_KEY when no key in URL', () => {
        vi.stubEnv('VITE_DEVICE_API_KEY', 'env-key-456');

        expect(adapter.getDeviceApiKey()).toBe('env-key-456');
      });

      it('prefers the URL key over the env var', () => {
        vi.stubEnv('VITE_DEVICE_API_KEY', 'env-key-456');
        window.history.pushState({}, '', '/?key=url-key');

        expect(adapter.getDeviceApiKey()).toBe('url-key');
      });

      it('throws when the env var is empty', () => {
        vi.stubEnv('VITE_DEVICE_API_KEY', '');

        expect(() => adapter.getDeviceApiKey()).toThrow('DEVICE_API_KEY not found in URL');
      });
    });
  });

  describe('restartApp', () => {
    it('navigates to origin with the cached key', async () => {
      window.history.pushState({}, '', '/?key=restart-key');
      adapter.getDeviceApiKey();

      await adapter.restartApp();

      expect(window.location.href).toBe(`${window.location.origin}/?key=restart-key`);
    });
  });
});
