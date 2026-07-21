import { describe, expect, it, vi, beforeEach } from 'vitest';

import { safeInvoke } from './tauriContext';

// Mock @platform to NOT auto-resolve to browser — we test the Tauri adapter directly

const mockSafeInvoke = vi.mocked(safeInvoke);

// Import the Tauri adapter directly (bypasses @platform alias)
const { adapter } = await import('./index');

beforeEach(() => {
  vi.clearAllMocks();
  mockSafeInvoke.mockReset();
});

describe('TauriAdapter', () => {
  it('has platform set to "tauri"', () => {
    expect(adapter.platform).toBe('tauri');
  });

  describe('RFID methods (no-ops — mock scanning lives in the useRfidScanning hook)', () => {
    it('initializeNfc resolves without invoking the Rust backend', async () => {
      await adapter.initializeNfc();
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });

    it('startScanning and stopScanning resolve without invoking the Rust backend', async () => {
      await adapter.startScanning(vi.fn());
      await adapter.stopScanning();
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });

    it('getServiceStatus reports not running', async () => {
      const result = await adapter.getServiceStatus();
      expect(result).toEqual({ is_running: false });
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });

    it('scanSingleTag returns the deterministic mock tag', async () => {
      const result = await adapter.scanSingleTag(5000);
      expect(result).toEqual({ success: true, tag_id: '04:D6:94:82:97:6A:80' });
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });
  });

  describe('loadConfig / getApiBaseUrl / getDeviceApiKey', () => {
    it('throws if getApiBaseUrl called before loadConfig on fresh adapter', async () => {
      // Re-import to get a fresh adapter instance with null config
      vi.resetModules();
      const freshModule = await import('./index');
      const freshAdapter = freshModule.adapter;

      expect(() => freshAdapter.getApiBaseUrl()).toThrow(
        'TauriAdapter: call loadConfig() before getApiBaseUrl()'
      );
    });

    it('throws if getDeviceApiKey called before loadConfig on fresh adapter', async () => {
      vi.resetModules();
      const freshModule = await import('./index');
      const freshAdapter = freshModule.adapter;

      expect(() => freshAdapter.getDeviceApiKey()).toThrow(
        'TauriAdapter: call loadConfig() before getDeviceApiKey()'
      );
    });

    it('loads config and returns values', async () => {
      mockSafeInvoke.mockResolvedValueOnce({
        api_base_url: 'https://api.example.com',
        device_api_key: 'secret-key-123',
      });

      await adapter.loadConfig();

      expect(adapter.getApiBaseUrl()).toBe('https://api.example.com');
      expect(adapter.getDeviceApiKey()).toBe('secret-key-123');
      expect(mockSafeInvoke).toHaveBeenCalledWith('get_api_config');
    });
  });

  describe('saveSessionSettings', () => {
    it('calls safeInvoke with settings', async () => {
      const settings = { roomId: 1, roomName: 'Room A' };
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.saveSessionSettings(settings as never);
      expect(mockSafeInvoke).toHaveBeenCalledWith('save_session_settings', { settings });
    });
  });

  describe('loadSessionSettings', () => {
    it('returns session settings from safeInvoke', async () => {
      const settings = { roomId: 1, roomName: 'Room A' };
      mockSafeInvoke.mockResolvedValueOnce(settings);
      const result = await adapter.loadSessionSettings();
      expect(result).toEqual(settings);
      expect(mockSafeInvoke).toHaveBeenCalledWith('load_session_settings');
    });

    it('returns null when no settings saved', async () => {
      mockSafeInvoke.mockResolvedValueOnce(null);
      const result = await adapter.loadSessionSettings();
      expect(result).toBeNull();
    });
  });

  describe('clearLastSession', () => {
    it('calls safeInvoke with clear_last_session', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.clearLastSession();
      expect(mockSafeInvoke).toHaveBeenCalledWith('clear_last_session');
    });
  });

  describe('persistLog', () => {
    it('calls safeInvoke with write_log', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.persistLog('test log entry');
      expect(mockSafeInvoke).toHaveBeenCalledWith('write_log', { entry: 'test log entry' });
    });
  });

  describe('restartApp', () => {
    it('calls safeInvoke with restart_app', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.restartApp();
      expect(mockSafeInvoke).toHaveBeenCalledWith('restart_app');
    });
  });
});
