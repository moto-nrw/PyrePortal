/**
 * Session Storage Service
 * Handles saving and loading of the recent session combination history
 */

import { adapter } from '@platform';

import { createLogger, serializeError } from '../utils/logger';

const logger = createLogger('SessionStorage');

export const SESSION_HISTORY_LIMIT = 5;

export interface SessionHistoryEntry {
  activity_id: number;
  room_id: number;
  supervisor_ids: number[];
  saved_at: string; // Last time this combination was used
  // Display names (from server, may change)
  activity_name: string;
  room_name: string;
  supervisor_names: string[];
}

export interface SessionSettings {
  auto_save_enabled: boolean; // Always true for now
  session_history: SessionHistoryEntry[];
  // Legacy single-slot fields, kept optional so old persisted JSON still
  // deserializes; migrated into session_history on load.
  use_last_session?: boolean;
  last_session?: SessionHistoryEntry | null;
}

export const isSameCombination = (a: SessionHistoryEntry, b: SessionHistoryEntry): boolean =>
  a.activity_id === b.activity_id &&
  a.room_id === b.room_id &&
  a.supervisor_ids.length === b.supervisor_ids.length &&
  [...a.supervisor_ids].sort((x, y) => x - y).join(',') ===
    [...b.supervisor_ids].sort((x, y) => x - y).join(',');

/**
 * Insert an entry at the front of the history, merging an identical
 * combination (same activity, room and supervisor set) instead of
 * duplicating it. The result is capped at SESSION_HISTORY_LIMIT.
 */
export function upsertHistoryEntry(
  history: SessionHistoryEntry[],
  entry: SessionHistoryEntry
): SessionHistoryEntry[] {
  const remaining = history.filter(existing => !isSameCombination(existing, entry));
  return [entry, ...remaining].slice(0, SESSION_HISTORY_LIMIT);
}

/**
 * Normalize persisted settings to the current shape: ensure session_history
 * is an array and fold a legacy last_session slot into it once.
 */
function migrateSettings(settings: SessionSettings): {
  settings: SessionSettings;
  migrated: boolean;
} {
  const history = Array.isArray(settings.session_history) ? settings.session_history : [];
  const legacyEntry = settings.last_session ?? null;

  const migratedHistory = legacyEntry ? upsertHistoryEntry(history, legacyEntry) : history;
  const migrated =
    legacyEntry !== null ||
    !Array.isArray(settings.session_history) ||
    settings.use_last_session !== undefined;

  return {
    settings: {
      auto_save_enabled: settings.auto_save_enabled ?? true,
      session_history: migratedHistory,
    },
    migrated,
  };
}

/**
 * Save session settings to persistent storage
 */
export async function saveSessionSettings(settings: SessionSettings): Promise<void> {
  try {
    logger.debug('Saving session settings', {
      historyLength: settings.session_history.length,
    });

    await adapter.saveSessionSettings(settings);

    logger.info('Session settings saved successfully');
  } catch (error) {
    logger.error('Failed to save session settings', { error: serializeError(error) });
    throw error;
  }
}

/**
 * Load session settings from persistent storage.
 * Legacy single-slot settings are migrated into the history and persisted once.
 */
export async function loadSessionSettings(): Promise<SessionSettings | null> {
  try {
    logger.debug('Loading session settings');

    const stored = await adapter.loadSessionSettings();

    if (!stored) {
      logger.debug('No session settings found');
      return null;
    }

    const { settings, migrated } = migrateSettings(stored);

    if (migrated) {
      logger.info('Migrated legacy session settings to history format', {
        historyLength: settings.session_history.length,
      });
      await adapter.saveSessionSettings(settings);
    }

    logger.info('Session settings loaded', {
      historyLength: settings.session_history.length,
    });

    return settings;
  } catch (error) {
    logger.error('Failed to load session settings', { error: serializeError(error) });
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
}
