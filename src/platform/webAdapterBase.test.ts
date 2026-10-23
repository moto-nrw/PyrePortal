import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebAdapterBase } from './webAdapterBase';

class TestAdapter extends WebAdapterBase {}

describe('WebAdapterBase', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new TestAdapter();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getDeviceApiKey', () => {
    it('imports a fragment credential, removes it, and survives a new adapter', () => {
      window.history.pushState({}, '', '/kiosk?mode=wedge#key=example-device-credential&keep=1');
      expect(adapter.getDeviceApiKey()).toBe('example-device-credential');
      expect(window.location.search).toBe('?mode=wedge');
      expect(window.location.hash).toBe('#keep=1');
      expect(new TestAdapter().getDeviceApiKey()).toBe('example-device-credential');
    });

    it('scrubs every legacy query key and prefers the fragment during rotation', () => {
      window.history.pushState(
        {},
        '',
        '/?key=example-old-credential&key=duplicate&mode=wedge#key=example-new-credential'
      );
      expect(adapter.getDeviceApiKey()).toBe('example-new-credential');
      expect(window.location.href).toBe(`${window.location.origin}/?mode=wedge`);
    });

    it('removes a query credential even when local storage is unavailable', () => {
      window.history.pushState({}, '', '/?key=example-device-credential');
      const write = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Local storage unavailable');
      });
      try {
        expect(() => adapter.getDeviceApiKey()).toThrow('Local storage unavailable');
        expect(window.location.search).toBe('');
      } finally {
        write.mockRestore();
      }
    });

    it('reads the key from the URL and caches it', () => {
      window.history.pushState({}, '', '/?key=test-key-123');
      expect(adapter.getDeviceApiKey()).toBe('test-key-123');

      // Key removed from URL — the cached value is returned
      window.history.pushState({}, '', '/');
      expect(adapter.getDeviceApiKey()).toBe('test-key-123');
    });

    it('throws when no key in URL and no cached key', () => {
      vi.stubEnv('VITE_DEVICE_API_KEY', '');

      expect(() => adapter.getDeviceApiKey()).toThrow('DEVICE_API_KEY not found in URL');
    });

    it('ignores VITE_DEVICE_API_KEY when no key in URL and no cached key', () => {
      vi.stubEnv('VITE_DEVICE_API_KEY', 'env-key-456');

      expect(() => adapter.getDeviceApiKey()).toThrow('DEVICE_API_KEY not found in URL');
    });

    it('prefers the URL key even when VITE_DEVICE_API_KEY is set', () => {
      vi.stubEnv('VITE_DEVICE_API_KEY', 'env-key-456');
      window.history.pushState({}, '', '/?key=url-key');

      expect(adapter.getDeviceApiKey()).toBe('url-key');
    });
  });

  describe('restartApp', () => {
    it('scrubs a legacy URL even when restart is called before reading the key', async () => {
      window.history.pushState({}, '', '/?key=example-device-credential&mode=wedge');
      await adapter.restartApp();
      expect(window.location.search).toBe('?mode=wedge');
      expect(new TestAdapter().getDeviceApiKey()).toBe('example-device-credential');
    });

    it('restarts without putting the credential back into the URL', async () => {
      window.history.pushState({}, '', '/?key=restart-key');
      adapter.getDeviceApiKey();

      await adapter.restartApp();

      expect(window.location.href).toBe(`${window.location.origin}/`);
    });
  });
});
