/**
 * School name state for the device.
 * Loaded best-effort from the backend after API initialization.
 */

import { createLogger } from '../utils/logger';

import { apiCall, buildAuthHeaders } from './apiClient';

const logger = createLogger('API');

const schoolNameState = { value: null as string | null };

const schoolNameListeners = new Set<(name: string) => void>();

/**
 * Returns the school name for the device, or null if not yet loaded / unavailable.
 */
export function getSchoolName(): string | null {
  return schoolNameState.value;
}

/**
 * Register a listener that fires once when the school name becomes available.
 * If the name is already loaded, the listener is called synchronously.
 * Returns an unsubscribe function.
 */
export function onSchoolNameLoaded(listener: (name: string) => void): () => void {
  if (schoolNameState.value) {
    listener(schoolNameState.value);
    return () => undefined;
  }
  schoolNameListeners.add(listener);
  return () => schoolNameListeners.delete(listener);
}

/**
 * Fetch school name from the backend (best-effort).
 * Call after initializeApi(). Failure is silently ignored.
 */
export async function fetchSchoolName(): Promise<void> {
  try {
    const res = await apiCall<{ status: string; data: { name: string } }>('/api/iot/school-name', {
      headers: buildAuthHeaders(),
    });
    schoolNameState.value = res.data.name;
    logger.info('School name loaded', { schoolName: schoolNameState.value });
    for (const listener of schoolNameListeners) listener(schoolNameState.value);
    schoolNameListeners.clear();
  } catch {
    logger.warn('Failed to fetch school name, continuing without it');
  }
}
