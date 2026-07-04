/**
 * Wedge Platform Adapter
 *
 * For iPads and Android tablets with a USB NFC reader in keyboard-emulation
 * mode (e.g. ACS ACR1552U-MF configured as HID keyboard wedge). The reader
 * "types" the tag UID followed by Enter; a document-level keydown listener
 * captures it — no focused text field required.
 *
 * The reader must be configured to output the UID as hex followed by Enter.
 * Output is normalized to the GKT format: uppercase hex pairs joined by
 * colons (e.g. "F0:BC:E8:44"), so existing tag assignments keep matching.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { NfcScanEvent, PlatformAdapter } from '../adapter';

/**
 * Maximum gap between two keystrokes (ms) to still count as scanner input.
 * Wedge readers type with <30 ms between keys; longer gaps reset the buffer
 * so slow human typing never accumulates into a scan.
 */
const MAX_KEYSTROKE_GAP_MS = 250;

/** UIDs are 4, 7 or 10 bytes — accept any even-length hex of at least 4 bytes. */
const MIN_UID_HEX_CHARS = 8;

/**
 * Normalize raw wedge output into the GKT tag ID format.
 *
 * Accepts hex with optional separators ("04D69482976A80", "04:d6:94:82:97:6a:80",
 * "04 D6 94 82") and returns uppercase colon-separated pairs, or null when the
 * input is not a plausible UID.
 */
export function normalizeWedgeUid(raw: string): string | null {
  const hex = raw.replace(/[\s:.-]/g, '').toUpperCase();
  if (hex.length < MIN_UID_HEX_CHARS || hex.length % 2 !== 0) return null;
  if (!/^[0-9A-F]+$/.test(hex)) return null;
  const pairs = hex.match(/../g);
  return pairs ? pairs.join(':') : null;
}

class WedgeAdapter implements PlatformAdapter {
  readonly platform = 'wedge' as const;
  private scanCallback: ((event: NfcScanEvent) => void) | null = null;
  private cachedApiKey: string | null = null;
  private scanCounter = 0;
  private singleScanTimer: ReturnType<typeof setTimeout> | null = null;

  private buffer = '';
  private lastKeyAt = 0;
  private listenerAttached = false;

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    const now = performance.now();
    if (now - this.lastKeyAt > MAX_KEYSTROKE_GAP_MS) {
      this.buffer = '';
    }
    this.lastKeyAt = now;

    if (event.key === 'Enter') {
      const tagId = normalizeWedgeUid(this.buffer);
      this.buffer = '';
      if (tagId && this.scanCallback) {
        // Swallow the Enter so it doesn't activate a focused button.
        event.preventDefault();
        event.stopPropagation();
        this.scanCallback({ tagId, scanId: ++this.scanCounter });
      }
      return;
    }

    // Only single printable characters extend the buffer (ignores Shift, Tab, …)
    if (event.key.length === 1) {
      this.buffer += event.key;
    }
  };

  async initializeNfc(): Promise<void> {
    if (this.listenerAttached) return;
    // Capture phase so scans are seen even when a text field is focused.
    document.addEventListener('keydown', this.handleKeydown, true);
    this.listenerAttached = true;
  }

  private cancelPendingSingleScan(): void {
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
    // Same one-shot pattern as GKT: capture the next scan, then restore.
    const previousCallback = this.scanCallback;
    return new Promise(resolve => {
      const oneShotCallback = (event: NfcScanEvent) => {
        this.singleScanTimer = null;
        clearTimeout(timer);
        if (this.scanCallback === oneShotCallback) {
          this.scanCallback = previousCallback;
        }
        resolve({ success: true, tag_id: event.tagId });
      };

      const timer = setTimeout(() => {
        this.singleScanTimer = null;
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
    // No scanner recovery — the reader is a plain USB keyboard device
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    // A keyboard wedge is invisible to the page until it types; assume available
    return { is_available: true };
  }

  async loadConfig(): Promise<void> {
    // No-op: wedge reads config synchronously from env vars / URL params
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
    // eslint-disable-next-line no-console
    console.log('[PyrePortal]', entry);
  }

  async restartApp(): Promise<void> {
    if (this.cachedApiKey) {
      window.location.href = `${window.location.origin}/?key=${encodeURIComponent(this.cachedApiKey)}`;
    } else {
      window.location.reload();
    }
  }

  getDeviceInfo(): { platform: 'wedge'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new WedgeAdapter();
