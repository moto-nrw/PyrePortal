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

import type { PlatformAdapter } from '../adapter';
import { WebAdapterBase } from '../webAdapterBase';

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

class WedgeAdapter extends WebAdapterBase implements PlatformAdapter {
  readonly platform = 'wedge' as const;

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
      if (tagId) {
        // Swallow the Enter so it doesn't activate a focused button.
        event.preventDefault();
        event.stopPropagation();
        this.scanCallback?.({ tagId, scanId: ++this.scanCounter });
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

  async persistLog(entry: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[PyrePortal]', entry);
  }

  getDeviceInfo(): { platform: 'wedge'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new WedgeAdapter();
