/**
 * GKT Platform Adapter (stub)
 *
 * Will use system.js SYSTEM global + GKTKiosk bridge.
 * For now, this is a skeleton that satisfies the interface.
 * Actual implementation happens in Phase 1-4.
 */

import type { SessionSettings } from '../../services/sessionStorage';
import type { PlatformAdapter } from '../adapter';

class GKTAdapter implements PlatformAdapter {
  readonly platform = 'gkt' as const;

  async initializeNfc(): Promise<void> {
    throw new Error('GKTAdapter.initializeNfc not implemented yet');
  }

  async startScanning(_onScan: (tagId: string) => void): Promise<void> {
    throw new Error('GKTAdapter.startScanning not implemented yet');
  }

  async stopScanning(): Promise<void> {
    throw new Error('GKTAdapter.stopScanning not implemented yet');
  }

  async getServiceStatus(): Promise<{ is_running: boolean }> {
    throw new Error('GKTAdapter.getServiceStatus not implemented yet');
  }

  async scanSingleTag(
    _timeoutMs: number
  ): Promise<{ success: boolean; tag_id?: string; error?: string }> {
    throw new Error('GKTAdapter.scanSingleTag not implemented yet');
  }

  async recoverScanner(): Promise<void> {
    throw new Error('GKTAdapter.recoverScanner not implemented yet');
  }

  async getScannerStatus(): Promise<{
    is_available: boolean;
    last_error?: string;
  }> {
    throw new Error('GKTAdapter.getScannerStatus not implemented yet');
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

  async persistLog(_entry: string): Promise<void> {
    throw new Error('GKTAdapter.persistLog not implemented yet');
  }

  async restartApp(): Promise<void> {
    throw new Error('GKTAdapter.restartApp not implemented yet');
  }

  getDeviceInfo(): { platform: 'gkt'; version: string } {
    return { platform: this.platform, version: __APP_VERSION__ };
  }
}

export const adapter: PlatformAdapter = new GKTAdapter();
