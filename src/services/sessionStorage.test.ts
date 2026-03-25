import { describe, expect, it, vi, beforeEach } from 'vitest';

import { saveSessionSettings, loadSessionSettings, clearLastSession } from './sessionStorage';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    saveSessionSettings: vi.fn(),
    loadSessionSettings: vi.fn(),
    clearLastSession: vi.fn(),
  },
}));

const { adapter } = await import('@platform');
const mockAdapter = vi.mocked(adapter);

beforeEach(() => {
  vi.clearAllMocks();
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
  it('calls adapter.saveSessionSettings with correct data', async () => {
    mockAdapter.saveSessionSettings.mockResolvedValueOnce(undefined);
    await saveSessionSettings(sampleSettings);
    expect(mockAdapter.saveSessionSettings).toHaveBeenCalledWith(sampleSettings);
  });

  it('throws on adapter failure', async () => {
    mockAdapter.saveSessionSettings.mockRejectedValueOnce(new Error('IPC failed'));
    await expect(saveSessionSettings(sampleSettings)).rejects.toThrow('IPC failed');
  });
});

describe('loadSessionSettings', () => {
  it('returns settings on success', async () => {
    mockAdapter.loadSessionSettings.mockResolvedValueOnce(sampleSettings);
    const result = await loadSessionSettings();
    expect(result).toEqual(sampleSettings);
    expect(mockAdapter.loadSessionSettings).toHaveBeenCalled();
  });

  it('returns null when no settings exist', async () => {
    mockAdapter.loadSessionSettings.mockResolvedValueOnce(null);
    const result = await loadSessionSettings();
    expect(result).toBeNull();
  });

  it('returns null on adapter failure (graceful degradation)', async () => {
    mockAdapter.loadSessionSettings.mockRejectedValueOnce(new Error('Tauri not available'));
    const result = await loadSessionSettings();
    expect(result).toBeNull();
  });
});

describe('clearLastSession', () => {
  it('calls adapter.clearLastSession', async () => {
    mockAdapter.clearLastSession.mockResolvedValueOnce(undefined);
    await clearLastSession();
    expect(mockAdapter.clearLastSession).toHaveBeenCalled();
  });

  it('throws on adapter failure', async () => {
    mockAdapter.clearLastSession.mockRejectedValueOnce(new Error('fail'));
    await expect(clearLastSession()).rejects.toThrow('fail');
  });
});
