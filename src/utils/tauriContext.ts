/**
 * Tauri Context Detection Utility
 *
 * Provides utilities to detect if the app is running in a Tauri context
 * and handle invoke calls gracefully when Tauri is not available.
 */

// Check if we're running in a Tauri context
const isTauriContext = (): boolean => {
  // Primary check: Tauri runtime indicators
  if (typeof window !== 'undefined') {
    // Check for Tauri runtime
    if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) {
      return true;
    }

    // Check for Tauri API availability
    if ('__TAURI_INVOKE__' in window) {
      return true;
    }
  }

  // Secondary check: Check if we're in production build (likely Tauri)
  if (import.meta.env.PROD) {
    return true;
  }

  // Tertiary check: Environment variables that indicate Tauri dev mode
  if (import.meta.env.VITE_TAURI_DEV_HOST || import.meta.env.TAURI_DEV_HOST) {
    return true;
  }

  // Fallback: Check user agent for Tauri
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')) {
    return true;
  }

  return false;
};

// Safe invoke wrapper that handles missing Tauri context
export const safeInvoke = async <T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> => {
  if (!isTauriContext()) {
    throw new Error(`Tauri context not available. Command: ${command}`);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(
      `Failed to invoke ${command}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

// Check if RFID hardware is enabled
export const isRfidEnabled = (): boolean => {
  const rfidEnvEnabled = import.meta.env.VITE_ENABLE_RFID === 'true';
  const tauriAvailable = isTauriContext();

  return rfidEnvEnabled && tauriAvailable;
};
