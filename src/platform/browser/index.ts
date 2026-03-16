/**
 * Browser Platform Adapter (stub)
 *
 * Mock adapter for browser dev mode (npm run dev without Tauri).
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { PlatformAdapter } from '../adapter';

class BrowserAdapter implements PlatformAdapter {
  readonly platform = 'browser' as const;

  async initializeNfc(): Promise<void> {
    throw new Error('BrowserAdapter.initializeNfc not implemented yet');
  }

  async startScanning(_onScan: (tagId: string) => void): Promise<void> {
    throw new Error('BrowserAdapter.startScanning not implemented yet');
  }

  async stopScanning(): Promise<void> {
    throw new Error('BrowserAdapter.stopScanning not implemented yet');
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    throw new Error('BrowserAdapter.getServiceStatus not implemented yet');
  }

  async scanSingleTag(
    _timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    throw new Error('BrowserAdapter.scanSingleTag not implemented yet');
  }

  async recoverScanner(): Promise<void> {
    throw new Error('BrowserAdapter.recoverScanner not implemented yet');
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    throw new Error('BrowserAdapter.getScannerStatus not implemented yet');
  }

  async loadConfig(): Promise<void> {
    // No-op: browser reads config synchronously from env vars
  }

  getApiBaseUrl(): string {
    return (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8080';
  }

  getDeviceApiKey(): string {
    const urlKey = new URLSearchParams(window.location.search).get('key');
    return urlKey ?? (import.meta.env.VITE_DEVICE_API_KEY as string) ?? 'dev-key';
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
    console.log('[Log]', entry);
  }

  async restartApp(): Promise<void> {
    throw new Error('BrowserAdapter.restartApp not implemented yet');
  }

  getDeviceInfo(): { platform: 'browser'; version: string } {
    return { platform: this.platform, version: 'dev' };
  }
}

export const adapter: PlatformAdapter = new BrowserAdapter();
