import type { RfidScanResult } from './api';

/**
 * Timeout duration (in milliseconds) for daily checkout/destination modals.
 * 7 seconds provides a quick flow while still giving students time to respond.
 */
export const DAILY_CHECKOUT_TIMEOUT_MS = 7000;

/**
 * Timeout duration (in milliseconds) for farewell messages after actions.
 * 1.5 seconds is enough to read a short goodbye message while keeping queue throughput high.
 */
export const FAREWELL_TIMEOUT_MS = 1500;

/**
 * Timeout duration for successful pickup lookups.
 * Longer than transient attendance toasts so children can actually read the result.
 */
export const PICKUP_QUERY_RESULT_TIMEOUT_MS = 5000;

/**
 * Timeout duration for check-ins that display a pickup time,
 * long enough for the child to read it.
 */
export const CHECKIN_WITH_PICKUP_TIME_TIMEOUT_MS = 3500;

/**
 * Build a visible error result when pickup lookup stalls long enough to time out.
 * This keeps the kiosk responsive instead of silently dropping back to idle.
 */
export const createPickupQueryTimeoutResult = (): RfidScanResult => ({
  student_name: 'Abholzeit konnte nicht geladen werden',
  student_id: null,
  action: 'error',
  message: 'Zeitüberschreitung beim Laden der Abholzeit. Bitte erneut scannen.',
  showAsError: true,
});

/** Extended scan result type with optional flags */
export interface ExtendedScanResult extends RfidScanResult {
  showAsError?: boolean;
  isInfo?: boolean;
  isSchulhof?: boolean;
  isToilette?: boolean;
}

/**
 * Count delta for a check-in.
 * Schulhof/WC check-ins don't increment (student is leaving, not entering).
 */
export const getCheckinCountDelta = (scan: ExtendedScanResult): number => {
  if (scan.isSchulhof || scan.isToilette) {
    return 0; // No change for Schulhof/WC check-in
  }
  return 1; // Increment count
};

/**
 * Count delta for a check-out: the student leaves our room.
 */
export const getCheckoutCountDelta = (): number => -1;

/**
 * Count delta for a transfer, based on room direction.
 * +1 if incoming to our room, -1 if outgoing from our room.
 */
export const getTransferCountDelta = (
  scan: RfidScanResult,
  currentRoomName: string | undefined
): number => {
  if (scan.room_name === currentRoomName) {
    return 1; // Student transferred TO our room
  }
  if (scan.previous_room === currentRoomName) {
    return -1; // Student transferred FROM our room
  }
  return 0; // Not related to our room
};

/**
 * Checks if a scan result represents an error or info state.
 */
export const isNonActionableScan = (scan: ExtendedScanResult): boolean => {
  return Boolean(scan.showAsError) || Boolean(scan.isInfo);
};

/**
 * Whether the server-provided active_students count may replace the local count.
 * Skipped for Schulhof/WC scans: active_students refers to that room, not ours.
 */
export const shouldApplyAuthoritativeCount = (scan: ExtendedScanResult): boolean => {
  return scan.active_students != null && !scan.isSchulhof && !scan.isToilette;
};

/** Inputs for the modal timeout matrix. */
export interface ModalTimeoutParams {
  isPickupQueryLoading: boolean;
  isAwaitingPickupQueryScan: boolean;
  showingFarewell: boolean;
  hasCheckoutDestination: boolean;
  showFeedbackPrompt: boolean;
  scanAction: RfidScanResult['action'] | undefined;
  hasPickupTime: boolean;
  scanTimeout: number;
  modalDisplayTime: number;
}

/**
 * Determine modal timeout duration based on current state.
 * Rules are evaluated in priority order; the first match wins.
 */
export const getModalTimeoutDuration = (params: ModalTimeoutParams): number => {
  if (params.isPickupQueryLoading) {
    // Loading is also kiosk-blocking, so it needs the same bounded timeout as the scan prompt.
    return params.scanTimeout;
  }
  if (params.isAwaitingPickupQueryScan) {
    return params.scanTimeout;
  }
  // Farewell messages use shorter timeout (just showing goodbye)
  if (params.showingFarewell) {
    return FAREWELL_TIMEOUT_MS;
  }
  // Checkout destination states (buttons, feedback) use longer timeout
  if (params.hasCheckoutDestination || params.showFeedbackPrompt) {
    return DAILY_CHECKOUT_TIMEOUT_MS;
  }
  if (params.scanAction === 'pickup_info') {
    return PICKUP_QUERY_RESULT_TIMEOUT_MS;
  }
  // Check-in with pickup time needs longer so the child can read it
  if (params.scanAction === 'checked_in' && params.hasPickupTime) {
    return CHECKIN_WITH_PICKUP_TIME_TIMEOUT_MS;
  }
  // Normal scans use configured display time
  return params.modalDisplayTime;
};
