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

  getApiBaseUrl(): string {
    throw new Error('GKTAdapter.getApiBaseUrl not implemented yet');
  }

  getDeviceApiKey(): string {
    throw new Error('GKTAdapter.getDeviceApiKey not implemented yet');
  }

  async saveSessionSettings(_settings: SessionSettings): Promise<void> {
    throw new Error('GKTAdapter.saveSessionSettings not implemented yet');
  }

  async loadSessionSettings(): Promise<SessionSettings | null> {
    throw new Error('GKTAdapter.loadSessionSettings not implemented yet');
  }

  async clearLastSession(): Promise<void> {
    throw new Error('GKTAdapter.clearLastSession not implemented yet');
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
