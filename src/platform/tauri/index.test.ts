import { describe, expect, it, vi, beforeEach } from 'vitest';

import { safeInvoke } from '../../utils/tauriContext';

// Mock @platform to NOT auto-resolve to browser — we test the Tauri adapter directly
// But we need the Tauri event API mock (already in setup.ts)

const mockListen = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => (mockListen as (...a: unknown[]) => unknown)(...args),
}));

const mockSafeInvoke = vi.mocked(safeInvoke);

// Import the Tauri adapter directly (bypasses @platform alias)
const { adapter } = await import('./index');

beforeEach(() => {
  vi.clearAllMocks();
  mockSafeInvoke.mockReset();
  mockListen.mockReset();
});

describe('TauriAdapter', () => {
  it('has platform set to "tauri"', () => {
    expect(adapter.platform).toBe('tauri');
  });

  describe('initializeNfc', () => {
    it('calls safeInvoke with initialize_rfid_service', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.initializeNfc();
      expect(mockSafeInvoke).toHaveBeenCalledWith('initialize_rfid_service');
    });
  });

  describe('startScanning', () => {
    it('sets up listener and starts service', async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValueOnce(unlisten);
      mockSafeInvoke.mockResolvedValueOnce(undefined); // start_rfid_service

      const onScan = vi.fn();
      await adapter.startScanning(onScan);

      expect(mockListen).toHaveBeenCalledWith('rfid-scan', expect.any(Function));
      expect(mockSafeInvoke).toHaveBeenCalledWith('start_rfid_service');
    });

    it('dispatches scan events through onScan callback', async () => {
      let capturedCallback:
        | ((event: { payload: { tag_id: string; scan_id: number } }) => void)
        | null = null;
      mockListen.mockImplementation((_event: unknown, cb: unknown) => {
        capturedCallback = cb as typeof capturedCallback;
        return Promise.resolve(vi.fn());
      });
      mockSafeInvoke.mockResolvedValueOnce(undefined);

      const onScan = vi.fn();
      await adapter.startScanning(onScan);

      capturedCallback!({ payload: { tag_id: 'AA:BB:CC:DD', scan_id: 42 } });
      expect(onScan).toHaveBeenCalledWith({ tagId: 'AA:BB:CC:DD', scanId: 42 });
    });

    it('cleans up previous listener before starting new one', async () => {
      const unlisten1 = vi.fn();
      const unlisten2 = vi.fn();
      mockListen.mockResolvedValueOnce(unlisten1);
      mockSafeInvoke.mockResolvedValue(undefined);

      await adapter.startScanning(vi.fn());

      mockListen.mockResolvedValueOnce(unlisten2);
      await adapter.startScanning(vi.fn());

      expect(unlisten1).toHaveBeenCalledOnce();
    });

    it('cleans up listener if service start fails', async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValueOnce(unlisten);
      mockSafeInvoke.mockRejectedValueOnce(new Error('service failed'));

      await expect(adapter.startScanning(vi.fn())).rejects.toThrow('service failed');
      expect(unlisten).toHaveBeenCalledOnce();
    });
  });

  describe('stopScanning', () => {
    it('calls safeInvoke with stop_rfid_service', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.stopScanning();
      expect(mockSafeInvoke).toHaveBeenCalledWith('stop_rfid_service');
    });

    it('cleans up listener even if stop fails', async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValueOnce(unlisten);
      mockSafeInvoke.mockResolvedValueOnce(undefined); // start_rfid_service

      await adapter.startScanning(vi.fn());

      mockSafeInvoke.mockRejectedValueOnce(new Error('stop failed'));
      await expect(adapter.stopScanning()).rejects.toThrow('stop failed');
      expect(unlisten).toHaveBeenCalledOnce();
    });
  });

  describe('getServiceStatus', () => {
    it('returns service status from safeInvoke', async () => {
      mockSafeInvoke.mockResolvedValueOnce({ is_running: true });
      const result = await adapter.getServiceStatus();
      expect(result).toEqual({ is_running: true });
      expect(mockSafeInvoke).toHaveBeenCalledWith('get_rfid_service_status');
    });
  });

  describe('scanSingleTag', () => {
    it('passes timeout_ms to safeInvoke', async () => {
      mockSafeInvoke.mockResolvedValueOnce({ success: true, tag_id: 'AA:BB' });
      const result = await adapter.scanSingleTag(5000);
      expect(result).toEqual({ success: true, tag_id: 'AA:BB' });
      expect(mockSafeInvoke).toHaveBeenCalledWith('scan_rfid_single', { timeout_ms: 5000 });
    });
  });

  describe('recoverScanner', () => {
    it('calls safeInvoke with recover_rfid_scanner', async () => {
      mockSafeInvoke.mockResolvedValueOnce(undefined);
      await adapter.recoverScanner();
      expect(mockSafeInvoke).toHaveBeenCalledWith('recover_rfid_scanner');
    });
  });

  describe('getScannerStatus', () => {
    it('returns scanner status', async () => {
      mockSafeInvoke.mockResolvedValueOnce({ is_available: true });
      const result = await adapter.getScannerStatus();
      expect(result).toEqual({ is_available: true });
      expect(mockSafeInvoke).toHaveBeenCalledWith('get_rfid_scanner_status');
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

  describe('getDeviceInfo', () => {
    it('returns platform and version', () => {
      const info = adapter.getDeviceInfo();
      expect(info.platform).toBe('tauri');
      expect(typeof info.version).toBe('string');
    });
  });
});
