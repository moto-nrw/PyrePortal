import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('uses wedge without a native bridge even when system.js is present', async () => {
  vi.stubGlobal('GKTKiosk', undefined);
  vi.stubGlobal('SYSTEM', { registerNfc: vi.fn() });
  const { adapter } = await import('./index');
  expect(adapter.platform).toBe('wedge');
});

it('gives the native GKT bridge priority and forwards rapid NFC scans', async () => {
  vi.stubGlobal('GKTKiosk', {});
  let receiveNfc: (payload: unknown) => void = () => {};
  vi.stubGlobal('SYSTEM', {
    registerNfc: (callback: typeof receiveNfc) => {
      receiveNfc = callback;
    },
  });
  const { adapter } = await import('./index');
  expect(adapter.platform).toBe('gkt');
  await adapter.initializeNfc();
  const onScan = vi.fn();
  await adapter.startScanning(onScan);
  receiveNfc({ uid: 'aa:bb:cc:dd', eventNumber: 1 });
  receiveNfc({ uid: '11:22:33:44', eventNumber: 2 });
  expect(onScan.mock.calls).toEqual([
    [{ tagId: 'AA:BB:CC:DD', scanId: 1 }],
    [{ tagId: '11:22:33:44', scanId: 2 }],
  ]);
  await adapter.stopScanning();
});

it('keeps GKT initialization failures visible instead of falling back to wedge', async () => {
  vi.stubGlobal('GKTKiosk', {});
  vi.stubGlobal('SYSTEM', undefined);
  const { adapter } = await import('./index');
  expect(adapter.platform).toBe('gkt');
  await expect(adapter.initializeNfc()).rejects.toThrow();
});

it('captures real wedge input without system.js and preserves the URL device key', async () => {
  vi.stubGlobal('GKTKiosk', null);
  vi.stubGlobal('SYSTEM', undefined);
  window.history.replaceState({}, '', '/?key=test-kiosk-key');
  const { adapter } = await import('./index');
  expect(adapter.platform).toBe('wedge');
  expect(adapter.getDeviceApiKey()).toBe('test-kiosk-key');
  await adapter.initializeNfc();
  const onScan = vi.fn();
  await adapter.startScanning(onScan);
  for (const key of [...'aabbccdd', 'Enter', ...'11223344', 'Enter']) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }
  expect(onScan.mock.calls).toEqual([
    [{ tagId: 'AA:BB:CC:DD', scanId: 1 }],
    [{ tagId: '11:22:33:44', scanId: 2 }],
  ]);
  await adapter.stopScanning();
  window.history.replaceState({}, '', '/');
});
