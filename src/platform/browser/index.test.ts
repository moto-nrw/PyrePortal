import { describe, expect, it, vi, beforeEach } from 'vitest';

const { adapter } = await import('./index');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('BrowserAdapter', () => {
  it('has platform set to "browser"', () => {
    expect(adapter.platform).toBe('browser');
  });

  describe('initializeNfc', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.initializeNfc()).resolves.toBeUndefined();
    });
  });

  describe('startScanning', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.startScanning(vi.fn())).resolves.toBeUndefined();
    });
  });

  describe('stopScanning', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.stopScanning()).resolves.toBeUndefined();
    });
  });

  describe('getServiceStatus', () => {
    it('returns is_running false', async () => {
      const status = await adapter.getServiceStatus();
      expect(status).toEqual({ is_running: false });
    });
  });

  describe('scanSingleTag', () => {
    it('resolves with a mock tag after delay', async () => {
      vi.useFakeTimers();

      const scanPromise = adapter.scanSingleTag(5000);
      vi.advanceTimersByTime(1000);

      const result = await scanPromise;
      expect(result).toEqual({ success: true, tag_id: '04:D6:94:82:97:6A:80' });

      vi.useRealTimers();
    });
  });

  describe('recoverScanner', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.recoverScanner()).resolves.toBeUndefined();
    });
  });

  describe('getScannerStatus', () => {
    it('returns always available', async () => {
      const status = await adapter.getScannerStatus();
      expect(status).toEqual({ is_available: true });
    });
  });

  describe('loadConfig', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.loadConfig()).resolves.toBeUndefined();
    });
  });

  describe('getApiBaseUrl', () => {
    it('returns a string URL', () => {
      const url = adapter.getApiBaseUrl();
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('getDeviceApiKey', () => {
    it('returns a string key', () => {
      const key = adapter.getDeviceApiKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('session storage', () => {
    it('saves and loads session settings via localStorage', async () => {
      const settings = {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: null,
      };

      await adapter.saveSessionSettings(settings);
      const loaded = await adapter.loadSessionSettings();
      expect(loaded).toEqual(settings);
    });

    it('returns null when no session saved', async () => {
      const loaded = await adapter.loadSessionSettings();
      expect(loaded).toBeNull();
    });

    it('clears session from localStorage', async () => {
      await adapter.saveSessionSettings({
        use_last_session: true,
        auto_save_enabled: true,
        last_session: null,
      });
      await adapter.clearLastSession();
      const loaded = await adapter.loadSessionSettings();
      expect(loaded).toBeNull();
    });

    it('persists complex session data', async () => {
      const settings = {
        use_last_session: true,
        auto_save_enabled: true,
        last_session: {
          activity_id: 1,
          room_id: 2,
          supervisor_ids: [3, 4],
          saved_at: '2026-03-23T10:00:00Z',
          activity_name: 'Art',
          room_name: 'Room A',
          supervisor_names: ['Teacher A', 'Teacher B'],
        },
      };

      await adapter.saveSessionSettings(settings);
      const loaded = await adapter.loadSessionSettings();
      expect(loaded).toEqual(settings);
    });
  });

  describe('persistLog', () => {
    it('logs to console with [Log] prefix', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await adapter.persistLog('test log entry');
      expect(consoleSpy).toHaveBeenCalledWith('[Log]', 'test log entry');
      consoleSpy.mockRestore();
    });
  });

  describe('restartApp', () => {
    it('resolves without error', async () => {
      await expect(adapter.restartApp()).resolves.toBeUndefined();
    });
  });

  describe('getDeviceInfo', () => {
    it('returns browser platform with dev version', () => {
      const info = adapter.getDeviceInfo();
      expect(info).toEqual({ platform: 'browser', version: 'dev' });
    });
  });
});
