/**
 * Tauri Platform Adapter
 *
 * Backs the local Mac/mock app only. Scanning is mock-based and handled
 * entirely in the frontend (useRfidScanning hook + src/dev/mockScanSource),
 * so the RFID methods are no-ops. Config, session persistence, logging and
 * restart delegate to the Rust backend via safeInvoke.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { NfcScanEvent, PlatformAdapter } from '../adapter';

import { safeInvoke } from './tauriContext';

class TauriAdapter implements PlatformAdapter {
  readonly platform = 'tauri' as const;
  private config: { api_base_url: string; device_api_key: string } | null = null;

  async initializeNfc(): Promise<void> {
    // No-op — mock scanning is handled directly in the useRfidScanning hook
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
    return { success: true, tag_id: '04:D6:94:82:97:6A:80' };
  }

  async loadConfig(): Promise<void> {
    this.config = await safeInvoke<{ api_base_url: string; device_api_key: string }>(
      'get_api_config'
    );
  }

  getApiBaseUrl(): string {
    if (!this.config) throw new Error('TauriAdapter: call loadConfig() before getApiBaseUrl()');
    return this.config.api_base_url;
  }

  getDeviceApiKey(): string {
    if (!this.config) throw new Error('TauriAdapter: call loadConfig() before getDeviceApiKey()');
    return this.config.device_api_key;
  }

  async saveSessionSettings(settings: SessionSettings): Promise<void> {
    await safeInvoke('save_session_settings', { settings });
  }

  async loadSessionSettings(): Promise<SessionSettings | null> {
    return await safeInvoke<SessionSettings | null>('load_session_settings');
  }

  async clearLastSession(): Promise<void> {
    await safeInvoke('clear_last_session');
  }

  async persistLog(entry: string): Promise<void> {
    await safeInvoke('write_log', { entry });
  }

  async restartApp(): Promise<void> {
    await safeInvoke('restart_app');
  }
}

export const adapter: PlatformAdapter = new TauriAdapter();
