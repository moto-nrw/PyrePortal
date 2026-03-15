import { describe, expect, it, vi, beforeEach } from 'vitest';

import { saveSessionSettings, loadSessionSettings, clearLastSession } from './sessionStorage';

// safeInvoke is globally mocked in test/setup.ts — override per test
const mockSafeInvoke = vi.mocked((await import('../utils/tauriContext')).safeInvoke);

beforeEach(() => {
  mockSafeInvoke.mockReset();
});

const sampleSettings = {
  use_last_session: true,
  auto_save_enabled: true,
  last_session: {
    activity_id: 1,
    room_id: 2,
    supervisor_ids: [3],
    saved_at: '2024-01-01',
    activity_name: 'Fußball',
    room_name: 'Turnhalle',
    supervisor_names: ['Herr M'],
  },
};

describe('saveSessionSettings', () => {
  it('calls safeInvoke with correct command', async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await saveSessionSettings(sampleSettings);
    expect(mockSafeInvoke).toHaveBeenCalledWith('save_session_settings', {
      settings: sampleSettings,
    });
  });

  it('throws on IPC failure', async () => {
    mockSafeInvoke.mockRejectedValueOnce(new Error('IPC failed'));
    await expect(saveSessionSettings(sampleSettings)).rejects.toThrow('IPC failed');
  });
});

describe('loadSessionSettings', () => {
  it('returns settings on success', async () => {
    mockSafeInvoke.mockResolvedValueOnce(sampleSettings);
    const result = await loadSessionSettings();
    expect(result).toEqual(sampleSettings);
    expect(mockSafeInvoke).toHaveBeenCalledWith('load_session_settings');
  });

  it('returns null when no settings exist', async () => {
    mockSafeInvoke.mockResolvedValueOnce(null);
    const result = await loadSessionSettings();
    expect(result).toBeNull();
  });

  it('returns null on IPC failure (graceful degradation)', async () => {
    mockSafeInvoke.mockRejectedValueOnce(new Error('Tauri not available'));
    const result = await loadSessionSettings();
    expect(result).toBeNull();
  });
});

describe('clearLastSession', () => {
  it('calls safeInvoke with correct command', async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await clearLastSession();
    expect(mockSafeInvoke).toHaveBeenCalledWith('clear_last_session');
  });

  it('throws on IPC failure', async () => {
    mockSafeInvoke.mockRejectedValueOnce(new Error('fail'));
    await expect(clearLastSession()).rejects.toThrow('fail');
  });
});
