import { useUserStore } from '../store/userStore';
import { createLogger, serializeError } from '../utils/logger';

import { api, mapApiErrorToGerman, ApiError, formatRoomName } from './api';
import type { RfidScanResult, CurrentSession } from './api';

const logger = createLogger('scanProcessor');

/**
 * Frontend display type for scan results. `navigateOnClose` tells the page
 * component to navigate to the given route when the scan modal closes.
 */
export interface ScanDisplayResult extends RfidScanResult {
  navigateOnClose?: string;
}

/**
 * Creates a session expired error result for display.
 */
export const createSessionExpiredResult = (): ScanDisplayResult => ({
  student_name: 'Sitzung abgelaufen',
  student_id: null,
  action: 'error',
  message: 'Bitte melden Sie sich erneut an.',
  showAsError: true,
  navigateOnClose: '/home',
});

/**
 * Creates the redirect result shown when an already-known supervisor scans.
 * Navigation happens on modal close (handled by the page component).
 */
export const createSupervisorRedirectResult = (): ScanDisplayResult => ({
  student_name: 'Betreuer erkannt',
  student_id: null,
  action: 'supervisor_authenticated',
  message: 'Betreuer wird zum Home-Bildschirm weitergeleitet.',
  isInfo: true,
  navigateOnClose: '/home',
});

/**
 * Evaluates supervisor authentication from an RFID scan.
 * Returns a handled outcome describing what the presenter should show.
 */
interface SupervisorScanParams {
  result: RfidScanResult;
  tagId: string;
  currentSession: CurrentSession | null;
  pin: string;
  scannedSupervisors: Set<number>;
  addSupervisorFromRfid: (staffId: number, staffName: string) => boolean;
  addActiveSupervisorTag: (tagId: string) => void;
  isActiveSupervisor: (tagId: string) => boolean;
}

export type SupervisorScanOutcome =
  | { handled: false }
  | { handled: true; presentation: 'redirect' }
  | { handled: true; presentation: 'firstScan'; result: ScanDisplayResult };

export const evaluateSupervisorScan = async (
  params: SupervisorScanParams
): Promise<SupervisorScanOutcome> => {
  const {
    result,
    tagId,
    currentSession,
    pin,
    scannedSupervisors,
    addSupervisorFromRfid,
    addActiveSupervisorTag,
    isActiveSupervisor,
  } = params;

  if (result.action !== 'supervisor_authenticated') {
    return { handled: false };
  }

  const staffId = result.student_id;
  const staffName = result.student_name;

  if (staffId === null) {
    return { handled: false };
  }

  const alreadySelected = addSupervisorFromRfid(staffId, staffName);
  const wasSeenThisSession = scannedSupervisors.has(staffId);
  const isRepeatSupervisor = alreadySelected || wasSeenThisSession || isActiveSupervisor(tagId);

  // Track in-memory and mark tag active for fast return
  scannedSupervisors.add(staffId);
  addActiveSupervisorTag(tagId);

  // Sync supervisors with backend (fire-and-forget)
  if (currentSession && pin) {
    void syncSupervisorsWithBackend(currentSession, pin, staffId);
  }

  logger.info('Supervisor authenticated successfully', {
    supervisorName: staffName,
    message: result.message,
    staffId,
    isRepeatSupervisor,
    alreadySelected,
  });

  // Show redirect for repeat supervisors
  if (isRepeatSupervisor) {
    return { handled: true, presentation: 'redirect' };
  }

  // First-time supervisor scan - show added message
  const firstScanResult: ScanDisplayResult = {
    ...result,
    student_name: 'Betreuer erkannt',
    message: `${result.student_name} wurde als Betreuer zu diesem Raum hinzugefügt.`,
  };
  return { handled: true, presentation: 'firstScan', result: firstScanResult };
};

/**
 * Syncs supervisor list with backend after RFID authentication.
 */
const syncSupervisorsWithBackend = async (
  currentSession: CurrentSession,
  pin: string,
  staffId: number
): Promise<void> => {
  try {
    const updatedSupervisorIds = useUserStore.getState().selectedSupervisors.map(s => s.id);
    await api.updateSessionSupervisors(pin, currentSession.active_group_id, updatedSupervisorIds);
    logger.info('Supervisor synced via RFID (network path)', {
      staffId,
      sessionId: currentSession.active_group_id,
    });
  } catch (error) {
    logger.warn('Supervisor sync failed (network path)', {
      error: error instanceof Error ? error.message : String(error),
      staffId,
    });
  }
};

/**
 * Processes successful student scan - updates the short-lived result cache.
 */
interface StudentBookkeepingParams {
  result: RfidScanResult;
  tagId: string;
  recordTagScan: (
    tagId: string,
    data: { timestamp: number; studentId?: string; result?: RfidScanResult }
  ) => void;
}

export const processStudentBookkeeping = (params: StudentBookkeepingParams): void => {
  const { result, tagId, recordTagScan } = params;

  if (!result.student_id) {
    return;
  }

  const studentId = result.student_id.toString();

  // Short-lived result cache (in-memory only)
  recordTagScan(tagId, {
    timestamp: Date.now(),
    studentId,
    result,
  });
};

/**
 * Determines error title based on error type.
 */
const getErrorTitle = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === 'ROOM_CAPACITY_EXCEEDED') return 'Raum voll';
    if (error.code === 'ACTIVITY_CAPACITY_EXCEEDED') return 'Aktivität voll';
  }
  return 'Scan fehlgeschlagen';
};

/**
 * Build the duplicate-active-visit modal copy. The backend (Issue #844)
 * includes `room_name` in details so we can tell the user the actual room
 * the student is already in — which is often NOT the room being scanned.
 *
 * Two important details:
 *   1. We pass `room_name` through `formatRoomName` so internal "WC"
 *      surfaces as "Toilette" (consistent with `mapApiErrorToGerman` and
 *      the rest of the kiosk UI).
 *   2. If `room_name` is missing (degraded 409 path: backend couldn't
 *      reload the existing visit, or it was just closed by another
 *      scan), we do NOT know that the student is in a different room —
 *      the lookup may simply have failed. Use the same neutral copy as
 *      `mapApiErrorToGerman`'s fallback rather than claiming "anderer
 *      Raum", which could send staff to the wrong place.
 */
const buildAlreadyInMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    const roomName = error.details?.room_name;
    if (typeof roomName === 'string' && roomName.length > 0) {
      return `Bereits angemeldet in ${formatRoomName(roomName)}.`;
    }
  }
  return 'Schüler*in ist bereits angemeldet.';
};

/**
 * Detect duplicate-active-visit responses. Prefer the structured
 * `STUDENT_ALREADY_ACTIVE` code from the new 409 body (Issue #844). Keep
 * the substring fallback so older backend builds without the structured
 * response still resolve to the friendly modal instead of a generic error.
 */
const isStudentAlreadyActiveError = (error: unknown, errorMessage: string): boolean => {
  if (error instanceof ApiError && error.code === 'STUDENT_ALREADY_ACTIVE') {
    return true;
  }
  return errorMessage.includes('already has an active visit');
};

/**
 * Extract the student_id from a STUDENT_ALREADY_ACTIVE error if present.
 * The backend (Issue #844) ships the student id in `details.student_id`
 * even on the degraded 409 path, so we always have at least the identity
 * to wire into the dedup map. Older backends that only emit the substring
 * fallback won't include details — return null and accept that the next
 * scan event will hit the backend again until a successful scan
 * populates the mapping organically.
 */
const extractAlreadyActiveStudentId = (error: unknown): number | null => {
  if (error instanceof ApiError && typeof error.details?.student_id === 'number') {
    return error.details.student_id;
  }
  return null;
};

/**
 * Creates an error result for display when scan fails.
 */
export const createScanErrorResult = (error: unknown): ScanDisplayResult => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Special handling for "already checked in" scenario
  if (isStudentAlreadyActiveError(error, errorMessage)) {
    return {
      student_name: 'Bereits eingecheckt',
      student_id: extractAlreadyActiveStudentId(error),
      action: 'already_in',
      message: buildAlreadyInMessage(error),
      isInfo: true,
    };
  }

  // Generic error handling
  const userFriendlyMessage = mapApiErrorToGerman(error);
  return {
    student_name: getErrorTitle(error),
    student_id: null,
    action: 'error',
    message: userFriendlyMessage || 'Bitte erneut versuchen',
    showAsError: true,
  };
};

/**
 * Runs a pickup query against the backend and validates that the scan
 * context is still current when the response arrives. Stale responses
 * (scan mode changed or context id advanced) are discarded.
 */
interface PickupQueryParams {
  tagId: string;
  pin: string;
  scanContextId: number;
}

export type PickupQueryOutcome =
  | { status: 'stale' }
  | { status: 'success'; result: ScanDisplayResult }
  | { status: 'error'; result: ScanDisplayResult };

export const runPickupQuery = async (params: PickupQueryParams): Promise<PickupQueryOutcome> => {
  const { tagId, pin, scanContextId } = params;

  try {
    const result = await api.queryPickupInfo({ student_rfid: tagId }, pin);
    const latestState = useUserStore.getState();
    if (
      latestState.rfid.scanMode !== 'pickupQuery' ||
      latestState.rfid.scanContextId !== scanContextId
    ) {
      logger.debug('Discarding stale pickup query result', {
        tagId,
        scanContextId,
      });
      return { status: 'stale' };
    }

    const { active_students: _, ...pickupResult } = result;
    return { status: 'success', result: { ...pickupResult, scannedTagId: tagId } };
  } catch (error) {
    logger.error('Failed to query pickup info', { error: serializeError(error) });

    const latestState = useUserStore.getState();
    if (
      latestState.rfid.scanMode !== 'pickupQuery' ||
      latestState.rfid.scanContextId !== scanContextId
    ) {
      logger.debug('Discarding stale pickup query error', {
        tagId,
        scanContextId,
      });
      return { status: 'stale' };
    }

    return { status: 'error', result: createScanErrorResult(error) };
  }
};

/**
 * Updates session activity (fire-and-forget semantics: failures are logged,
 * never surfaced to the user).
 */
export const updateSessionActivityQuietly = async (
  pin: string,
  context: 'scan' | 'pickup'
): Promise<void> => {
  try {
    await api.updateSessionActivity(pin);
    logger.debug(
      context === 'pickup'
        ? 'Session activity updated after pickup query'
        : 'Session activity updated'
    );
  } catch (activityError) {
    logger.warn(
      context === 'pickup'
        ? 'Failed to update session activity after pickup query'
        : 'Failed to update session activity',
      { error: activityError }
    );
  }
};
