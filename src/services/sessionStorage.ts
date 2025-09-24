/**
 * Session Storage Service
 * Handles saving and loading of last session configuration
 */

import { createLogger } from '../utils/logger';
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
  use_last_session: boolean;  // Toggle state
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
    logger.error('Failed to save session settings', { error });
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
    logger.error('Failed to load session settings', { error });
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
    logger.error('Failed to clear last session', { error });
    throw error;
  }
}

/**
 * Helper function to get relative time string
 */
export function getRelativeTime(savedAt: string): string {
  const saved = new Date(savedAt);
  const now = new Date();
  const diffMs = now.getTime() - saved.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 5) return 'gerade eben';
      return `vor ${diffMinutes} Minuten`;
    }
    if (diffHours === 1) return 'vor einer Stunde';
    return `vor ${diffHours} Stunden`;
  }
  
  if (diffDays === 1) return 'gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'vor einer Woche' : `vor ${weeks} Wochen`;
  }
  
  const months = Math.floor(diffDays / 30);
  return months === 1 ? 'vor einem Monat' : `vor ${months} Monaten`;
}