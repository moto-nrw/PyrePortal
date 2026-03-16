/**
 * GKT Platform Adapter (stub)
 *
 * Will use system.js SYSTEM global + GKTKiosk bridge.
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { PlatformAdapter } from '../adapter';

// SYSTEM is a global injected by system.js (loaded in index.html)
declare const SYSTEM: {
  registerNfc(
    callback: (obj: { uid: string; eventSource: string; eventNumber: number }) => void
  ): void;
  log2(facility: string, msg: string): void;
};

class GKTAdapter implements PlatformAdapter {
  readonly platform = 'gkt' as const;
  private scanCallback: ((tagId: string) => void) | null = null;

  async initializeNfc(): Promise<void> {
    // Register NFC callback with system.js
    SYSTEM.registerNfc(obj => {
      if (this.scanCallback) {
        this.scanCallback(obj.uid.toUpperCase());
      }
    });
  }

  async startScanning(_onScan: (tagId: string) => void): Promise<void> {
    throw new Error('GKTAdapter.startScanning not implemented yet');
  }

  async stopScanning(): Promise<void> {
    throw new Error('GKTAdapter.stopScanning not implemented yet');
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    // GKT NFC is always running once registered
    return { is_running: this.scanCallback !== null };
  }

  async scanSingleTag(
    _timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    // GKT has no blocking single-scan API
    return {
      success: false,
      error: 'Single-tag scan not supported on GKT. Use continuous scanning.',
    };
  }

  async recoverScanner(): Promise<void> {
    // No scanner recovery on GKT — NFC is managed by GKT-Kiosk system
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    // NFC is always available if usbnfc APK is installed
    return { is_available: true };
  }

  async loadConfig(): Promise<void> {
    // No-op: GKT reads config synchronously from env vars / URL params
  }

  getApiBaseUrl(): string {
    return (import.meta.env.VITE_API_BASE_URL as string) ?? 'https://api.moto-app.de';
  }

  getDeviceApiKey(): string {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) {
      throw new Error('DEVICE_API_KEY not found in URL. Expected ?key=...');
    }
    return key;
  }

  async saveSessionSettings(settings: SessionSettings): Promise<void> {
    localStorage.setItem('pyreportal_session', JSON.stringify(settings));
  }

  async loadSessionSettings(): Promise<SessionSettings | null> {
    const data = localStorage.getItem('pyreportal_session');
    return data ? (JSON.parse(data) as SessionSettings) : null;
  }

  async clearLastSession(): Promise<void> {
    localStorage.removeItem('pyreportal_session');
  }

  async persistLog(entry: string): Promise<void> {
    try {
      SYSTEM.log2('PyrePortal', entry);
    } catch {
      // eslint-disable-next-line no-console
      console.log(entry);
    }
  }

  async restartApp(): Promise<void> {
    window.location.reload();
  }

  getDeviceInfo(): { platform: 'gkt'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new GKTAdapter();
