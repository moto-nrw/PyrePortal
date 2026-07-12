/**
 * Shared localStorage-backed session persistence.
 *
 * Used by the Browser and GKT adapters, which persist session settings
 * identically in localStorage. The Tauri adapter persists via the Rust
 * backend instead and does not use this helper.
 */

import type { SessionSettings } from '../../services/sessionStorage';

const SESSION_STORAGE_KEY = 'pyreportal_session';

export const saveSessionSettingsToLocalStorage = (settings: SessionSettings): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(settings));
};

export const loadSessionSettingsFromLocalStorage = (): SessionSettings | null => {
  const data = localStorage.getItem(SESSION_STORAGE_KEY);
  return data ? (JSON.parse(data) as SessionSettings) : null;
};

export const clearLastSessionFromLocalStorage = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
};
