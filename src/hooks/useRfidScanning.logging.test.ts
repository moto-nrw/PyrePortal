import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NfcScanEvent } from '../platform/adapter';
import { api, type RfidScanResponse } from '../services/api';
import { useUserStore } from '../store/userStore';

import { useRfidScanning } from './useRfidScanning';

// Production persists INFO and above to the device log; DEBUG stays out.
const { logCalls } = vi.hoisted(() => ({
  logCalls: [] as { level: string; message: string; data?: unknown }[],
}));

vi.mock('../utils/logger', () => {
  const record = (level: string) => (message: string, data?: unknown) => {
    logCalls.push({ level, message, data });
  };
  const createRecordingLogger = () => ({
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    wouldLog: () => false,
  });
  return {
    LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
    createLogger: vi.fn(() => createRecordingLogger()),
    logger: createRecordingLogger(),
    logUserAction: (action: string, details?: Record<string, unknown>) =>
      logCalls.push({ level: 'info', message: 'User action', data: { action, ...details } }),
    logNavigation: vi.fn(),
    logError: vi.fn(),
    serializeError: vi.fn((error: unknown) => ({ message: String(error) })),
  };
});

vi.mock('@platform', () => ({
  adapter: {
    platform: 'gkt',
    initializeNfc: vi.fn().mockResolvedValue(undefined),
    startScanning: vi.fn(),
    stopScanning: vi.fn().mockResolvedValue(undefined),
    getServiceStatus: vi.fn().mockResolvedValue({ is_running: true }),
  },
}));

vi.mock('../services/api', () => ({
  api: {
    processRfidScan: vi.fn(),
    updateSessionActivity: vi.fn().mockResolvedValue(undefined),
    updateSessionSupervisors: vi.fn().mockResolvedValue({ supervisors: [] }),
  },
  mapApiErrorToGerman: vi.fn(() => 'Ein Fehler ist aufgetreten'),
  formatRoomName: vi.fn((name: string) => name),
}));

const { adapter } = await import('@platform');

const TAG = '04:AA:BB:CC:DD:EE:FF';

const persistedLogText = () => JSON.stringify(logCalls.filter(call => call.level !== 'debug'));

async function scanOnce(response: RfidScanResponse) {
  vi.mocked(api.processRfidScan).mockResolvedValue(response);

  let onScan: ((event: NfcScanEvent) => void) | undefined;
  vi.mocked(adapter.startScanning).mockImplementation(async callback => {
    onScan = callback;
  });

  const { result } = renderHook(() => useRfidScanning());
  await act(async () => {
    await result.current.startScanning();
  });
  await act(async () => {
    onScan!({ tagId: TAG, scanId: 1 });
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useRfidScanning device log', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logCalls.length = 0;
    useUserStore.setState({
      ...useUserStore.getInitialState(),
      authenticatedUser: { staffId: 1, staffName: 'OGS Device', deviceName: 'Pi-5', pin: '1234' },
      selectedRoom: { id: 10, name: 'Raum A', is_occupied: false },
      selectedSupervisors: [],
      activeSupervisorTags: new Set<string>(),
    });
  });

  afterEach(async () => {
    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('keeps tag ID and student name of a scan out of persisted log levels', async () => {
    await scanOnce({
      student_id: 42,
      student_name: 'Mila Beispiel',
      action: 'checked_in',
      message: 'Eingecheckt',
    });

    expect(api.processRfidScan).toHaveBeenCalled();
    expect(persistedLogText()).not.toContain(TAG);
    expect(persistedLogText()).not.toContain('Mila');
    expect(logCalls).toContainEqual(
      expect.objectContaining({ level: 'debug', data: expect.objectContaining({ tagId: TAG }) })
    );
    expect(logCalls).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'RFID scan completed via server',
        data: expect.objectContaining({ action: 'checked_in' }),
      })
    );
  });

  it('keeps the supervisor name of a supervisor scan out of persisted log levels', async () => {
    await scanOnce({
      student_id: 7,
      student_name: 'Jona Beispiel',
      action: 'supervisor_authenticated',
      message: 'Supervisor authenticated',
    });

    expect(useUserStore.getState().selectedSupervisors).toContainEqual({
      id: 7,
      name: 'Jona Beispiel',
    });
    expect(persistedLogText()).not.toContain(TAG);
    expect(persistedLogText()).not.toContain('Jona');
  });
});
