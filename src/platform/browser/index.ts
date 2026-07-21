/**
 * Browser Platform Adapter (stub)
 *
 * Mock adapter for browser dev mode (pnpm run dev without Tauri).
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { NfcScanEvent, PlatformAdapter } from '../adapter';
import {
  clearLastSessionFromLocalStorage,
  loadSessionSettingsFromLocalStorage,
  saveSessionSettingsToLocalStorage,
} from '../shared/localStorageSession';

class BrowserAdapter implements PlatformAdapter {
  readonly platform = 'browser' as const;

  async initializeNfc(): Promise<void> {
    // No-op in browser — mock scanning is handled in useRfidScanning hook
  }

  async startScanning(_onScan: (event: NfcScanEvent) => void): Promise<void> {
    // No-op — mock scanning is handled directly in the useRfidScanning hook
  }

  async stopScanning(): Promise<void> {
    // No-op — mock scanning is handled directly in the useRfidScanning hook
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    return { is_running: false };
  }

  async scanSingleTag(
    _timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true, tag_id: '04:D6:94:82:97:6A:80' });
      }, 1000);
    });
  }

  async loadConfig(): Promise<void> {
    // No-op: browser reads config synchronously from env vars
  }

  getApiBaseUrl(): string {
    return (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8080';
  }

  getDeviceApiKey(): string {
    const urlKey = new URLSearchParams(window.location.search).get('key');
    return urlKey ?? (import.meta.env.VITE_DEVICE_API_KEY as string) ?? 'dev-key';
  }

  async saveSessionSettings(settings: SessionSettings): Promise<void> {
    saveSessionSettingsToLocalStorage(settings);
  }

  async loadSessionSettings(): Promise<SessionSettings | null> {
    return loadSessionSettingsFromLocalStorage();
  }

  async clearLastSession(): Promise<void> {
    clearLastSessionFromLocalStorage();
  }

  async persistLog(entry: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[Log]', entry);
  }

  async restartApp(): Promise<void> {
    window.location.reload();
  }
}

export const adapter: PlatformAdapter = new BrowserAdapter();
