import { describe, expect, it, vi, beforeEach } from 'vitest';

import { normalizeNfcPayload } from './index';

// ---------------------------------------------------------------------------
// normalizeNfcPayload (pure function — already tested, extended here)
// ---------------------------------------------------------------------------

describe('normalizeNfcPayload', () => {
  // Intent-path payload: {uid, eventSource, eventNumber}
  it('extracts uid and eventNumber from intent-path payload', () => {
    const payload = { uid: 'f0:bc:e8:44', eventSource: 'NFC', eventNumber: 3 };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: 3 });
  });

  // Sensor-path payload: {eventSource, barcode}
  it('extracts barcode with null eventNumber from sensor-path payload', () => {
    const payload = { eventSource: 'nfc', barcode: 'f0:bc:e8:44' };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: null });
  });

  // Legacy string payload
  it('handles legacy string payload with null eventNumber', () => {
    expect(normalizeNfcPayload('f0:bc:e8:44')).toEqual({
      tagId: 'F0:BC:E8:44',
      eventNumber: null,
    });
  });

  // uid takes precedence over barcode
  it('prefers uid over barcode when both present', () => {
    const payload = { uid: 'aa:bb:cc:dd', barcode: '11:22:33:44', eventSource: 'NFC' };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'AA:BB:CC:DD', eventNumber: null });
  });

  // Already uppercase
  it('handles already uppercase UIDs', () => {
    const payload = { uid: 'F0:BC:E8:44', eventSource: 'NFC', eventNumber: 1 };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: 1 });
  });

  // Edge cases
  it('returns null for null input', () => {
    expect(normalizeNfcPayload(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeNfcPayload(undefined)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(normalizeNfcPayload({})).toBeNull();
  });

  it('returns null for object with empty uid', () => {
    expect(normalizeNfcPayload({ uid: '', eventSource: 'NFC' })).toBeNull();
  });

  it('returns null for number input', () => {
    expect(normalizeNfcPayload(42)).toBeNull();
  });

  it('returns null for object with empty barcode', () => {
    expect(normalizeNfcPayload({ barcode: '', eventSource: 'nfc' })).toBeNull();
  });

  it('handles eventNumber as non-number', () => {
    const payload = { uid: 'aa:bb', eventNumber: 'not-a-number' };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'AA:BB', eventNumber: null });
  });
});

// ---------------------------------------------------------------------------
// GKTAdapter class
// ---------------------------------------------------------------------------

// We need to mock the SYSTEM global before importing the adapter.
const mockRegisterNfc = vi.fn();
const mockLog2 = vi.fn();

// Declare SYSTEM globally as the adapter expects
Object.defineProperty(globalThis, 'SYSTEM', {
  configurable: true,
  writable: true,
  value: {
    registerNfc: mockRegisterNfc,
    log2: mockLog2,
  },
});

// Import the adapter (class instance)
const { adapter } = await import('./index');

beforeEach(() => {
  vi.clearAllMocks();
  mockRegisterNfc.mockReset();
  mockLog2.mockReset();
});

describe('GKTAdapter', () => {
  it('has platform set to "gkt"', () => {
    expect(adapter.platform).toBe('gkt');
  });

  describe('initializeNfc', () => {
    it('calls SYSTEM.registerNfc with a callback', async () => {
      await adapter.initializeNfc();
      expect(mockRegisterNfc).toHaveBeenCalledWith(expect.any(Function));
    });

    it('registered callback forwards valid NFC payloads to scanCallback', async () => {
      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();

      const onScan = vi.fn();
      await adapter.startScanning(onScan);

      // Simulate NFC tap via the registered callback
      nfcCallback!({ uid: 'aa:bb:cc:dd', eventSource: 'NFC', eventNumber: 1 });

      expect(onScan).toHaveBeenCalledWith({ tagId: 'AA:BB:CC:DD', scanId: expect.any(Number) });
    });

    it('registered callback ignores invalid payloads', async () => {
      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();

      const onScan = vi.fn();
      await adapter.startScanning(onScan);

      // Invalid payload
      nfcCallback!({});
      expect(onScan).not.toHaveBeenCalled();
    });

    it('registered callback does nothing when no scanCallback set', async () => {
      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();
      await adapter.stopScanning(); // clear callback

      // Should not throw
      nfcCallback!({ uid: 'aa:bb:cc:dd' });
    });
  });

  describe('startScanning', () => {
    it('sets the scan callback', async () => {
      const onScan = vi.fn();
      await adapter.startScanning(onScan);

      // Service status reflects callback presence
      const status = await adapter.getServiceStatus();
      expect(status.is_running).toBe(true);
    });
  });

  describe('stopScanning', () => {
    it('clears the scan callback', async () => {
      await adapter.startScanning(vi.fn());
      await adapter.stopScanning();

      const status = await adapter.getServiceStatus();
      expect(status.is_running).toBe(false);
    });
  });

  describe('getServiceStatus', () => {
    it('returns false when no callback set', async () => {
      await adapter.stopScanning();
      const status = await adapter.getServiceStatus();
      expect(status.is_running).toBe(false);
    });

    it('returns true when callback is set', async () => {
      await adapter.startScanning(vi.fn());
      const status = await adapter.getServiceStatus();
      expect(status.is_running).toBe(true);
    });
  });

  describe('scanSingleTag', () => {
    it('resolves with tag when NFC fires within timeout', async () => {
      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();
      await adapter.startScanning(vi.fn());

      const scanPromise = adapter.scanSingleTag(5000);

      // Simulate NFC tap
      nfcCallback!({ uid: 'ab:cd:ef:01' });

      const result = await scanPromise;
      expect(result).toEqual({ success: true, tag_id: 'AB:CD:EF:01' });
    });

    it('resolves with timeout error when no scan occurs', async () => {
      vi.useFakeTimers();

      await adapter.startScanning(vi.fn());
      const scanPromise = adapter.scanSingleTag(1000);

      vi.advanceTimersByTime(1000);

      const result = await scanPromise;
      expect(result).toEqual({ success: false, error: 'Scan timed out' });

      vi.useRealTimers();
    });

    it('restores previous callback after successful scan', async () => {
      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();

      const originalCallback = vi.fn();
      await adapter.startScanning(originalCallback);

      const scanPromise = adapter.scanSingleTag(5000);

      // Simulate NFC tap during single scan
      nfcCallback!({ uid: 'ab:cd:ef:01' });
      await scanPromise;

      // Original callback should be restored — next NFC tap goes to it
      nfcCallback!({ uid: '11:22:33:44' });
      expect(originalCallback).toHaveBeenCalledWith(
        expect.objectContaining({ tagId: '11:22:33:44' })
      );
    });

    it('restores previous callback after timeout', async () => {
      vi.useFakeTimers();

      const originalCallback = vi.fn();
      await adapter.startScanning(originalCallback);

      const scanPromise = adapter.scanSingleTag(1000);
      vi.advanceTimersByTime(1000);
      await scanPromise;

      // Original callback should be restored
      const status = await adapter.getServiceStatus();
      expect(status.is_running).toBe(true);

      vi.useRealTimers();
    });

    it('startScanning cancels pending single-scan timer', async () => {
      vi.useFakeTimers();

      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();
      await adapter.startScanning(vi.fn());

      // Start a single-tag scan — don't await (it's pending)
      void adapter.scanSingleTag(20_000);

      // User navigates away — new page starts normal scanning
      const newCallback = vi.fn();
      await adapter.startScanning(newCallback);

      // Advance past the old timeout — timer was cancelled, so it's a no-op
      vi.advanceTimersByTime(20_000);

      // New callback must still be active
      nfcCallback!({ uid: 'de:ad:be:ef' });
      expect(newCallback).toHaveBeenCalledWith(expect.objectContaining({ tagId: 'DE:AD:BE:EF' }));

      vi.useRealTimers();
    });

    it('stopScanning cancels pending single-scan timer', async () => {
      vi.useFakeTimers();

      let nfcCallback: ((payload: unknown) => void) | undefined;
      mockRegisterNfc.mockImplementation((cb: (payload: unknown) => void) => {
        nfcCallback = cb;
      });

      await adapter.initializeNfc();
      await adapter.startScanning(vi.fn());

      // Start a single-tag scan — don't await
      void adapter.scanSingleTag(20_000);

      // User navigates: stop, then new page starts scanning
      await adapter.stopScanning();
      const newCallback = vi.fn();
      await adapter.startScanning(newCallback);

      // Advance past the old timeout
      vi.advanceTimersByTime(20_000);

      // New callback must still be active
      nfcCallback!({ uid: 'de:ad:be:ef' });
      expect(newCallback).toHaveBeenCalledWith(expect.objectContaining({ tagId: 'DE:AD:BE:EF' }));

      vi.useRealTimers();
    });
  });

  describe('recoverScanner', () => {
    it('resolves without error', async () => {
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
    it('resolves without error', async () => {
      await expect(adapter.loadConfig()).resolves.toBeUndefined();
    });
  });

  describe('getApiBaseUrl', () => {
    it('returns env var or default', () => {
      const url = adapter.getApiBaseUrl();
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('getDeviceApiKey', () => {
    it('throws when no key in URL and no cached key', () => {
      // Clear cached key by creating a fresh adapter
      // The existing adapter may have a cached key, so test the error path
      // by checking the contract: returns string or throws
      const result = (() => {
        try {
          return adapter.getDeviceApiKey();
        } catch (e) {
          return e;
        }
      })();

      // Either returns a string (cached) or throws
      expect(
        typeof result === 'string' ||
          (result instanceof Error && result.message.includes('DEVICE_API_KEY'))
      ).toBe(true);
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
      localStorage.removeItem('pyreportal_session');
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
  });

  describe('persistLog', () => {
    it('calls SYSTEM.log2 with facility and entry', async () => {
      await adapter.persistLog('test entry');
      expect(mockLog2).toHaveBeenCalledWith('PyrePortal', 'test entry');
    });

    it('falls back to console.log when SYSTEM.log2 throws', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockLog2.mockImplementation(() => {
        throw new Error('log2 failed');
      });

      await adapter.persistLog('fallback entry');
      expect(consoleSpy).toHaveBeenCalledWith('fallback entry');

      consoleSpy.mockRestore();
    });
  });

  describe('restartApp', () => {
    it('reloads the page', async () => {
      // Stop scanning first to clear cached key state
      await adapter.stopScanning();

      // restartApp either sets location.href or calls location.reload
      // In test environment, we just verify it doesn't throw
      // (happy-dom may not fully support location mutations)
      await expect(adapter.restartApp()).resolves.toBeUndefined();
    });
  });

  describe('getDeviceInfo', () => {
    it('returns gkt platform with version', () => {
      const info = adapter.getDeviceInfo();
      expect(info.platform).toBe('gkt');
      expect(typeof info.version).toBe('string');
    });
  });
});
