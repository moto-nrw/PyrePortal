/**
 * Shared base class for web-deployed platform adapters (GKT, wedge).
 *
 * Contains everything that does not depend on the NFC input source:
 * scan-callback management, the one-shot single-tag capture, config from
 * env vars / the `?key=` URL param, localStorage session persistence and
 * the key-preserving restart. Subclasses provide `platform`,
 * `initializeNfc`, `persistLog` and `getDeviceInfo`.
 */

import type { SessionSettings } from '../services/sessionStorage';

import type { NfcScanEvent, PlatformAdapter } from './adapter';

export abstract class WebAdapterBase implements Omit<
  PlatformAdapter,
  'platform' | 'initializeNfc' | 'persistLog' | 'getDeviceInfo'
> {
  protected scanCallback: ((event: NfcScanEvent) => void) | null = null;
  protected cachedApiKey: string | null = null;
  protected scanCounter = 0;
  private singleScanTimer: ReturnType<typeof setTimeout> | null = null;

  protected cancelPendingSingleScan(): void {
    if (this.singleScanTimer) {
      clearTimeout(this.singleScanTimer);
      this.singleScanTimer = null;
    }
  }

  async startScanning(onScan: (event: NfcScanEvent) => void): Promise<void> {
    // Cancel any pending scanSingleTag timeout so its stale closure
    // can't overwrite this newer callback when it fires.
    this.cancelPendingSingleScan();
    this.scanCallback = onScan;
  }

  async stopScanning(): Promise<void> {
    this.cancelPendingSingleScan();
    this.scanCallback = null;
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    return { is_running: this.scanCallback !== null };
  }

  async scanSingleTag(
    timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    // There is no blocking single-scan API — simulate by capturing the next
    // scan callback and resolving the promise with it.
    const previousCallback = this.scanCallback;
    return new Promise(resolve => {
      const oneShotCallback = (event: NfcScanEvent) => {
        this.singleScanTimer = null;
        clearTimeout(timer);
        // Only restore if we're still the active callback
        if (this.scanCallback === oneShotCallback) {
          this.scanCallback = previousCallback;
        }
        resolve({ success: true, tag_id: event.tagId });
      };

      const timer = setTimeout(() => {
        this.singleScanTimer = null;
        // Only restore if we're still the active callback
        if (this.scanCallback === oneShotCallback) {
          this.scanCallback = previousCallback;
        }
        resolve({ success: false, error: 'Scan timed out' });
      }, timeoutMs);

      this.singleScanTimer = timer;
      this.scanCallback = oneShotCallback;
    });
  }

  async recoverScanner(): Promise<void> {
    // No scanner recovery — NFC input is managed outside the page
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    // The page cannot probe the reader — assume available
    return { is_available: true };
  }

  async loadConfig(): Promise<void> {
    // No-op: config is read synchronously from env vars / URL params
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

  async restartApp(): Promise<void> {
    if (this.cachedApiKey) {
      window.location.href = `${window.location.origin}/?key=${encodeURIComponent(this.cachedApiKey)}`;
    } else {
      window.location.reload();
    }
  }
}
