/**
 * Session Storage Service
 * Handles saving and loading of last session configuration
 */

import { createLogger, serializeError } from '../utils/logger';
import { safeInvoke } from '../utils/tauriContext';

const logger = createLogger('SessionStorage');

export interface LastSessionConfig {
  activity_id: number;
  room_id: number;
  supervisor_ids: number[];
  saved_at: string;
  // Display names (from server, may change)
  activity_name: string;
  room_name: string;
  supervisor_names: string[];
}

export interface SessionSettings {
  use_last_session: boolean; // Toggle state
  auto_save_enabled: boolean; // Always true for now
  last_session: LastSessionConfig | null;
}

/**
 * Save session settings to persistent storage
 */
export async function saveSessionSettings(settings: SessionSettings): Promise<void> {
  try {
    logger.debug('Saving session settings', {
      useLastSession: settings.use_last_session,
      hasLastSession: !!settings.last_session,
    });

    await safeInvoke('save_session_settings', { settings });

    logger.info('Session settings saved successfully');
  } catch (error) {
    logger.error('Failed to save session settings', { error: serializeError(error) });
    throw error;
  }
}

/**
 * Load session settings from persistent storage
 */
export async function loadSessionSettings(): Promise<SessionSettings | null> {
  try {
    logger.debug('Loading session settings');

    const settings = await safeInvoke<SessionSettings | null>('load_session_settings');

    if (settings) {
      logger.info('Session settings loaded', {
        useLastSession: settings.use_last_session,
        hasLastSession: !!settings.last_session,
        savedAt: settings.last_session?.saved_at,
      });
    } else {
      logger.debug('No session settings found');
    }

    return settings;
  } catch (error) {
    logger.error('Failed to load session settings', { error: serializeError(error) });
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
}

/**
 * Clear the last session data (but keep toggle state)
 */
export async function clearLastSession(): Promise<void> {
  try {
    logger.debug('Clearing last session data');

    await safeInvoke('clear_last_session');

    logger.info('Last session data cleared');
  } catch (error) {
    logger.error('Failed to clear last session', { error: serializeError(error) });
    throw error;
  }
}
