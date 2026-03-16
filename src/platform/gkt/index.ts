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
  registerNfc(callback: (payload: unknown) => void): void;
  log2(facility: string, msg: string): void;
};

/**
 * Normalize NFC payload from system.js into an uppercase UID string.
 *
 * system.js delivers scans via two paths with different payload shapes:
 * 1. Intent-path: {uid: "f0:bc:e8:44", eventSource: "NFC", eventNumber: N}
 * 2. Sensor-path: {eventSource: "nfc", barcode: "f0:bc:e8:44"}
 * 3. Legacy string: "f0:bc:e8:44"
 */
export function normalizeNfcPayload(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload.toUpperCase();
  }

  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;

    // Intent-path: {uid: "f0:bc:e8:44", eventSource: "NFC"}
    if (typeof obj.uid === 'string' && obj.uid) {
      return obj.uid.toUpperCase();
    }

    // Sensor-path: {eventSource: "nfc", barcode: "f0:bc:e8:44"}
    if (typeof obj.barcode === 'string' && obj.barcode) {
      return obj.barcode.toUpperCase();
    }
  }

  return null;
}

class GKTAdapter implements PlatformAdapter {
  readonly platform = 'gkt' as const;
  private scanCallback: ((tagId: string) => void) | null = null;
  private cachedApiKey: string | null = null;

  async initializeNfc(): Promise<void> {
    // Register NFC callback with system.js — handles all payload shapes
    SYSTEM.registerNfc((payload: unknown) => {
      if (!this.scanCallback) return;

      const tagId = normalizeNfcPayload(payload);
      if (tagId) {
        this.scanCallback(tagId);
      }
    });
  }

  async startScanning(onScan: (tagId: string) => void): Promise<void> {
    // GKT NFC is always-on after registerNfc — just set callback
    this.scanCallback = onScan;
  }

  async stopScanning(): Promise<void> {
    this.scanCallback = null;
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
      if (this.cachedApiKey) {
        return this.cachedApiKey;
      }
      throw new Error('DEVICE_API_KEY not found in URL. Expected ?key=...');
    }
    this.cachedApiKey = key;
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
    if (this.cachedApiKey) {
      window.location.href = `${window.location.origin}/?key=${encodeURIComponent(this.cachedApiKey)}`;
    } else {
      window.location.reload();
    }
  }

  getDeviceInfo(): { platform: 'gkt'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new GKTAdapter();
