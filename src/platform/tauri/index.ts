/**
 * Tauri Platform Adapter (stub)
 *
 * Re-exports will delegate to safeInvoke + Tauri event API.
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import { safeInvoke } from '../../utils/tauriContext';
import type { PlatformAdapter } from '../adapter';

class TauriAdapter implements PlatformAdapter {
  readonly platform = 'tauri' as const;
  private config: { api_base_url: string; device_api_key: string } | null = null;

  async initializeNfc(): Promise<void> {
    throw new Error('TauriAdapter.initializeNfc not implemented yet');
  }

  async startScanning(_onScan: (tagId: string) => void): Promise<void> {
    throw new Error('TauriAdapter.startScanning not implemented yet');
  }

  async stopScanning(): Promise<void> {
    throw new Error('TauriAdapter.stopScanning not implemented yet');
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    return await safeInvoke<{ is_running: boolean }>('get_rfid_service_status');
  }

  async scanSingleTag(
    timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    return await safeInvoke<{ success: boolean; tag_id?: string; error?: string }>(
      'scan_rfid_single',
      { timeout_ms: timeoutMs }
    );
  }

  async recoverScanner(): Promise<void> {
    await safeInvoke('recover_rfid_scanner');
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    return await safeInvoke<{ is_available: boolean; last_error?: string }>(
      'get_rfid_scanner_status'
    );
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

  getDeviceInfo(): { platform: 'tauri'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new TauriAdapter();
