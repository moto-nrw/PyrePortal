/**
 * Tauri Context Detection Utility
 * 
 * Provides utilities to detect if the app is running in a Tauri context
 * and handle invoke calls gracefully when Tauri is not available.
 */

// Check if we're running in a Tauri context
export const isTauriContext = (): boolean => {
  // Check if window.__TAURI__ exists (Tauri runtime indicator)
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return true;
  }
  
  // Check if we're in production build (likely Tauri)
  if (import.meta.env.PROD) {
    return true;
  }
  
  // Check if TAURI_DEV_HOST is set (running with `npm run tauri dev`)
  if (import.meta.env.VITE_TAURI_DEV_HOST) {
    return true;
  }
  
  return false;
};

// Safe invoke wrapper that handles missing Tauri context
export const safeInvoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauriContext()) {
    throw new Error(`Tauri context not available. Command: ${command}`);
  }
  
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(`Failed to invoke ${command}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Check if RFID hardware is enabled
export const isRfidEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_RFID === 'true' && isTauriContext();
};