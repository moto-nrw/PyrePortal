import { describe, expect, it, beforeEach } from 'vitest';

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
      expect(() => adapter.getDeviceApiKey()).toThrow('DEVICE_API_KEY not found in URL');
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
