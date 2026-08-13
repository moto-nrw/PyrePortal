import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  SESSION_HISTORY_LIMIT,
  loadSessionSettings,
  saveSessionSettings,
  upsertHistoryEntry,
  type SessionHistoryEntry,
  type SessionSettings,
} from './sessionStorage';

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

const makeEntry = (overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  activity_id: 1,
  room_id: 2,
  supervisor_ids: [3],
  saved_at: '2024-01-01T10:00:00Z',
  activity_name: 'Fußball',
  room_name: 'Turnhalle',
  supervisor_names: ['Herr M'],
  ...overrides,
});

const sampleSettings: SessionSettings = {
  auto_save_enabled: true,
  session_history: [makeEntry()],
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
    mockAdapter.loadSessionSettings.mockRejectedValueOnce(new Error('storage not available'));
    const result = await loadSessionSettings();
    expect(result).toBeNull();
  });

  it('does not persist again when settings are already in the current shape', async () => {
    mockAdapter.loadSessionSettings.mockResolvedValueOnce(sampleSettings);
    await loadSessionSettings();
    expect(mockAdapter.saveSessionSettings).not.toHaveBeenCalled();
  });
});

describe('loadSessionSettings migration', () => {
  it('migrates a legacy last_session into the history and persists once', async () => {
    const legacyEntry = makeEntry();
    mockAdapter.loadSessionSettings.mockResolvedValueOnce({
      use_last_session: true,
      auto_save_enabled: true,
      last_session: legacyEntry,
    } as SessionSettings);

    const result = await loadSessionSettings();

    expect(result).toEqual({
      auto_save_enabled: true,
      session_history: [legacyEntry],
    });
    expect(mockAdapter.saveSessionSettings).toHaveBeenCalledWith({
      auto_save_enabled: true,
      session_history: [legacyEntry],
    });
  });

  it('normalizes legacy settings without last_session to an empty history', async () => {
    mockAdapter.loadSessionSettings.mockResolvedValueOnce({
      use_last_session: false,
      auto_save_enabled: true,
      last_session: null,
    } as SessionSettings);

    const result = await loadSessionSettings();

    expect(result).toEqual({ auto_save_enabled: true, session_history: [] });
  });

  it('does not duplicate a legacy entry already present in the history', async () => {
    const entry = makeEntry();
    mockAdapter.loadSessionSettings.mockResolvedValueOnce({
      auto_save_enabled: true,
      session_history: [entry, makeEntry({ activity_id: 9 })],
      last_session: makeEntry({ saved_at: '2024-02-01T10:00:00Z' }),
    });

    const result = await loadSessionSettings();

    expect(result!.session_history).toHaveLength(2);
    expect(result!.session_history[0].saved_at).toBe('2024-02-01T10:00:00Z');
  });
});

describe('upsertHistoryEntry', () => {
  it('prepends a new combination', () => {
    const existing = makeEntry();
    const other = makeEntry({ activity_id: 7, activity_name: 'Basteln' });

    const result = upsertHistoryEntry([existing], other);

    expect(result).toEqual([other, existing]);
  });

  it('merges an identical combination and moves it to the front', () => {
    const older = makeEntry();
    const other = makeEntry({ activity_id: 7 });
    const refreshed = makeEntry({ saved_at: '2024-03-01T10:00:00Z' });

    const result = upsertHistoryEntry([other, older], refreshed);

    expect(result).toEqual([refreshed, other]);
  });

  it('treats supervisor id order as irrelevant for deduplication', () => {
    const existing = makeEntry({ supervisor_ids: [3, 4] });
    const reordered = makeEntry({ supervisor_ids: [4, 3] });

    const result = upsertHistoryEntry([existing], reordered);

    expect(result).toEqual([reordered]);
  });

  it('caps the history at the limit', () => {
    const history = Array.from({ length: SESSION_HISTORY_LIMIT }, (_, i) =>
      makeEntry({ activity_id: i + 10 })
    );
    const fresh = makeEntry({ activity_id: 99 });

    const result = upsertHistoryEntry(history, fresh);

    expect(result).toHaveLength(SESSION_HISTORY_LIMIT);
    expect(result[0]).toEqual(fresh);
    expect(result.map(e => e.activity_id)).not.toContain(10 + SESSION_HISTORY_LIMIT - 1);
  });
});
