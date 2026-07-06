/**
 * Platform Adapter Interface
 *
 * Each build target (tauri, gkt, browser) implements this interface.
 * Vite resolves `@platform` to the correct directory based on BUILD_TARGET.
 */

import { adapter } from '@platform';

import type { SessionSettings } from '../services/sessionStorage';

type Platform = 'tauri' | 'gkt' | 'browser' | 'wedge';

/**
 * True when the current platform uses real NFC/RFID hardware (not mock).
 * - GKT: always real (NFC via system.js)
 * - Wedge: always real (USB reader in keyboard-emulation mode)
 * - Browser and Tauri Mac/mock app: mock
 */
export const isRealScanningEnabled = (): boolean =>
  adapter.platform === 'gkt' || adapter.platform === 'wedge';

export interface NfcScanEvent {
  tagId: string;
  scanId: number;
}

export interface PlatformAdapter {
  readonly platform: Platform;

  // --- NFC / RFID Scanning ---
  initializeNfc(): Promise<void>;
  startScanning(onScan: (event: NfcScanEvent) => void): Promise<void>;
  stopScanning(): Promise<void>;

  // --- Service Lifecycle (Tauri: polls backend, GKT: no-op) ---
  getServiceStatus(): Promise<{ is_running: boolean }>;

  // --- Single Tag Scan (admin tag assignment UI) ---
  scanSingleTag(timeoutMs: number): Promise<{ success: boolean; tag_id?: string; error?: string }>;

  // --- Configuration ---
  /** Async config init (Tauri: loads from Rust backend, others: no-op) */
  loadConfig(): Promise<void>;
  getApiBaseUrl(): string;
  getDeviceApiKey(): string;

  // --- Session Persistence ---
  saveSessionSettings(settings: SessionSettings): Promise<void>;
  loadSessionSettings(): Promise<SessionSettings | null>;
  clearLastSession(): Promise<void>;

  // --- Logging ---
  persistLog(entry: string): Promise<void>;

  // --- App Lifecycle ---
  restartApp(): Promise<void>;
}
