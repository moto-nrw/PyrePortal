/**
 * Shared base class for web-deployed platform adapters (GKT, wedge).
 *
 * Contains everything that does not depend on the NFC input source:
 * scan-callback management, the one-shot single-tag capture, config from
 * env vars, the `?key=` device key, localStorage session persistence and
 * the key-preserving restart. Subclasses provide `platform`, `initializeNfc`
 * and `persistLog`.
 */

import type { SessionSettings } from '../services/sessionStorage';

import type { NfcScanEvent, PlatformAdapter } from './adapter';
import {
  clearLastSessionFromLocalStorage,
  loadSessionSettingsFromLocalStorage,
  saveSessionSettingsToLocalStorage,
} from './shared/localStorageSession';

type ScanCallback = (event: NfcScanEvent) => void;
type SingleScanResult = { success: boolean; tag_id?: string; error?: string };

interface PendingSingleScan {
  timer: ReturnType<typeof setTimeout>;
  callback: ScanCallback;
  previousCallback: ScanCallback | null;
  resolve: (result: SingleScanResult) => void;
}

export abstract class WebAdapterBase implements Omit<
  PlatformAdapter,
  'platform' | 'initializeNfc' | 'persistLog'
> {
  protected scanCallback: ScanCallback | null = null;
  protected cachedApiKey: string | null = null;
  protected scanCounter = 0;
  private pendingSingleScan: PendingSingleScan | null = null;

  protected cancelPendingSingleScan(): void {
    this.settlePendingSingleScan({ success: false, error: 'Scan canceled' });
  }

  private settlePendingSingleScan(result: SingleScanResult): void {
    const pending = this.pendingSingleScan;
    if (!pending) return;

    this.pendingSingleScan = null;
    clearTimeout(pending.timer);

    if (this.scanCallback === pending.callback) {
      this.scanCallback = pending.previousCallback;
    }

    pending.resolve(result);
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

  async scanSingleTag(timeoutMs: number): Promise<SingleScanResult> {
    // There is no blocking single-scan API — simulate by capturing the next
    // scan callback and resolving the promise with it.
    this.cancelPendingSingleScan();
    const previousCallback = this.scanCallback;
    return new Promise(resolve => {
      const oneShotCallback = (event: NfcScanEvent) => {
        if (this.pendingSingleScan?.callback !== oneShotCallback) return;
        this.settlePendingSingleScan({ success: true, tag_id: event.tagId });
      };

      const timer = setTimeout(() => {
        if (this.pendingSingleScan?.callback !== oneShotCallback) return;
        this.settlePendingSingleScan({ success: false, error: 'Scan timed out' });
      }, timeoutMs);

      this.pendingSingleScan = {
        timer,
        callback: oneShotCallback,
        previousCallback,
        resolve,
      };
      this.scanCallback = oneShotCallback;
    });
  }

  async loadConfig(): Promise<void> {
    // No-op: API base URL and device key are read synchronously.
  }

  getApiBaseUrl(): string {
    return (import.meta.env.VITE_API_BASE_URL as string) ?? 'https://api.moto-app.de';
  }

  getDeviceApiKey(): string {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (key) {
      this.cachedApiKey = key;
      return key;
    }
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }
    throw new Error('DEVICE_API_KEY not found in URL. Expected ?key=...');
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

  async restartApp(): Promise<void> {
    if (this.cachedApiKey) {
      window.location.href = `${window.location.origin}/?key=${encodeURIComponent(this.cachedApiKey)}`;
    } else {
      window.location.reload();
    }
  }
}
