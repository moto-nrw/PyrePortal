/**
 * GKT Platform Adapter (stub)
 *
 * Will use system.js SYSTEM global + GKTKiosk bridge.
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { PlatformAdapter } from '../adapter';
import { WebAdapterBase } from '../webAdapterBase';

// SYSTEM is a global injected by system.js (loaded in index.html)
declare const SYSTEM: {
  registerNfc(callback: (payload: unknown) => void): void;
  log2(facility: string, msg: string): void;
};

/**
 * Normalize NFC payload from system.js into a platform-agnostic scan event.
 *
 * system.js delivers scans via two paths with different payload shapes:
 * 1. Intent-path: {uid: "f0:bc:e8:44", eventSource: "NFC", eventNumber: N}
 * 2. Sensor-path: {eventSource: "nfc", barcode: "f0:bc:e8:44"}
 * 3. Legacy string: "f0:bc:e8:44"
 */
/**
 * Extract a tag ID and (when available) hardware-provided scan identity
 * from the raw system.js NFC payload.
 *
 * Returns `{ tagId, eventNumber? }` so the caller can decide how to
 * assign a scanId (hardware eventNumber vs. fallback counter).
 */
export function normalizeNfcPayload(
  payload: unknown
): { tagId: string; eventNumber: number | null } | null {
  if (typeof payload === 'string') {
    return { tagId: payload.toUpperCase(), eventNumber: null };
  }

  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;
    const eventNumber = typeof obj.eventNumber === 'number' ? obj.eventNumber : null;

    // Intent-path: {uid: "f0:bc:e8:44", eventSource: "NFC"}
    if (typeof obj.uid === 'string' && obj.uid) {
      return { tagId: obj.uid.toUpperCase(), eventNumber };
    }

    // Sensor-path: {eventSource: "nfc", barcode: "f0:bc:e8:44"}
    if (typeof obj.barcode === 'string' && obj.barcode) {
      return { tagId: obj.barcode.toUpperCase(), eventNumber };
    }
  }

  return null;
}

class GKTAdapter extends WebAdapterBase implements PlatformAdapter {
  readonly platform = 'gkt' as const;

  async initializeNfc(): Promise<void> {
    // Register NFC callback with system.js — handles all payload shapes.
    // GKT NFC fires once per physical tap (Android intent-based dispatch),
    // unlike MFRC522 which polls continuously. No adapter-level dedup needed —
    // every callback is a distinct scan. Tauri handles its own dedup in Rust.
    SYSTEM.registerNfc((payload: unknown) => {
      if (!this.scanCallback) return;

      const parsed = normalizeNfcPayload(payload);
      if (!parsed) return;

      this.scanCallback({
        tagId: parsed.tagId,
        scanId: parsed.eventNumber ?? ++this.scanCounter,
      });
    });
  }

  async persistLog(entry: string): Promise<void> {
    try {
      SYSTEM.log2('PyrePortal', entry);
    } catch {
      // eslint-disable-next-line no-console
      console.log(entry);
    }
  }

  getDeviceInfo(): { platform: 'gkt'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new GKTAdapter();
