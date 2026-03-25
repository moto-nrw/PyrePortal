/**
 * Tauri Platform Adapter (stub)
 *
 * Re-exports will delegate to safeInvoke + Tauri event API.
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import { safeInvoke } from '../../utils/tauriContext';
import type { NfcScanEvent, PlatformAdapter } from '../adapter';

class TauriAdapter implements PlatformAdapter {
  readonly platform = 'tauri' as const;
  private config: { api_base_url: string; device_api_key: string } | null = null;

  async initializeNfc(): Promise<void> {
    await safeInvoke('initialize_rfid_service');
  }

  private unlisten: (() => void) | null = null;

  async startScanning(onScan: (event: NfcScanEvent) => void): Promise<void> {
    // Clean up previous listener first (post-mortem #13: prevent duplicates)
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    // Set up listener BEFORE starting service (post-mortem #6: don't miss first scan)
    const { listen } = await import('@tauri-apps/api/event');
    this.unlisten = await listen<{ tag_id: string; scan_id: number }>('rfid-scan', event => {
      onScan({
        tagId: event.payload.tag_id,
        scanId: event.payload.scan_id,
      });
    });

    try {
      await safeInvoke('start_rfid_service');
    } catch (error) {
      // Clean up listener if service start fails (post-mortem #12)
      if (this.unlisten) {
        this.unlisten();
        this.unlisten = null;
      }
      throw error;
    }
  }

  async stopScanning(): Promise<void> {
    try {
      await safeInvoke('stop_rfid_service');
    } finally {
      // Always clean up listener even on failure (post-mortem #7)
      if (this.unlisten) {
        this.unlisten();
        this.unlisten = null;
      }
    }
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
