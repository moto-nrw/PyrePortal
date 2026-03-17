/**
 * Platform Adapter Interface
 *
 * Each build target (tauri, gkt, browser) implements this interface.
 * Vite resolves `@platform` to the correct directory based on BUILD_TARGET.
 */

import type { SessionSettings } from '../services/sessionStorage';

export type Platform = 'tauri' | 'gkt' | 'browser';

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

  // --- Scanner Health (Tauri: hardware recovery, GKT: no-op) ---
  recoverScanner(): Promise<void>;
  getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }>;

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

  // --- Device Info ---
  getDeviceInfo(): { platform: Platform; version: string };
}
