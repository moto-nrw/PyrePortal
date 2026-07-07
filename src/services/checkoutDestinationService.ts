import type { RecentTagScan } from '../store/slices/scanSlice';
import { createLogger, serializeError } from '../utils/logger';

import { api, isNetworkRelatedError, mapServerErrorToGerman, type RfidScanResult } from './api';

const logger = createLogger('checkoutDestinationService');

/** State for checkout destination modal (unified checkout + "nach Hause" flow) */
export interface CheckoutDestinationState {
  rfid: string;
  studentName: string;
  studentId: number | null;
  dailyCheckoutAvailable: boolean;
  showingFarewell: boolean;
}

/** Destination rooms a student can check into directly from the checkout modal. */
export type DestinationRoomKey = 'schulhof' | 'toilette';

interface DestinationRoomConfig {
  /** English label used in log messages */
  logLabel: string;
  notAvailableTitle: string;
  buildNotConfiguredMessage: (studentName: string) => string;
  buildSuccessMessage: (firstName: string) => string;
  /** Flag set on the success result for special modal styling */
  resultFlag: 'isSchulhof' | 'isToilette';
  failTitle: string;
  fallbackErrorMessage: string;
  networkErrorMessage: string;
}

const DESTINATION_ROOM_CONFIGS: Record<DestinationRoomKey, DestinationRoomConfig> = {
  schulhof: {
    logLabel: 'Schulhof',
    notAvailableTitle: 'Schulhof nicht verfügbar',
    buildNotConfiguredMessage: studentName =>
      `${studentName}: Schulhof-Raum wurde nicht konfiguriert.`,
    buildSuccessMessage: firstName => `Viel Spaß auf dem Schulhof, ${firstName}!`,
    resultFlag: 'isSchulhof',
    failTitle: 'Schulhof Check-in fehlgeschlagen',
    fallbackErrorMessage: 'Schulhof Check-in fehlgeschlagen',
    networkErrorMessage:
      'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
  },
  toilette: {
    logLabel: 'WC',
    notAvailableTitle: 'Toilette nicht verfügbar',
    buildNotConfiguredMessage: studentName =>
      `${studentName}: Toilette-Raum wurde nicht konfiguriert.`,
    buildSuccessMessage: firstName => `${firstName} geht auf Toilette`,
    resultFlag: 'isToilette',
    failTitle: 'Toilette Check-in fehlgeschlagen',
    fallbackErrorMessage: 'Toilette Check-in fehlgeschlagen',
    networkErrorMessage:
      'Netzwerkfehler bei Toilette-Anmeldung. Bitte Verbindung prüfen und erneut scannen.',
  },
};

export interface CheckInToDestinationParams {
  destination: DestinationRoomKey;
  roomId: number | null;
  state: CheckoutDestinationState;
  pin: string;
  recentTagScans: Map<string, RecentTagScan>;
}

/**
 * Checks a student into a destination room (Schulhof or Toilette) after checkout.
 *
 * Waits for the background checkout sync of the triggering scan to complete
 * before issuing the check-in. This prevents the race condition where the
 * check-in would reach the server before the checkout.
 *
 * Returns the scan result to display (success with destination flag, or a
 * visible error result). Never throws.
 */
export const checkInToDestinationRoom = async (
  params: CheckInToDestinationParams
): Promise<RfidScanResult> => {
  const { destination, roomId, state, pin, recentTagScans } = params;
  const config = DESTINATION_ROOM_CONFIGS[destination];

  if (!roomId) {
    logger.error(`Cannot check into ${config.logLabel}: room ID not available`);

    return {
      student_name: config.notAvailableTitle,
      student_id: state.studentId,
      action: 'error',
      message: config.buildNotConfiguredMessage(state.studentName),
      showAsError: true,
    };
  }

  try {
    logger.info(`Checking student into ${config.logLabel}`, {
      rfid: state.rfid,
      studentName: state.studentName,
      roomId,
    });

    // CRITICAL: Wait for background checkout sync to complete
    // This prevents race condition where check-in happens before checkout
    const recentScan = recentTagScans.get(state.rfid);
    if (recentScan?.syncPromise) {
      logger.debug('Waiting for background checkout sync to complete');
      await recentScan.syncPromise;
      logger.debug(`Background sync completed, proceeding with ${config.logLabel} check-in`);
    }

    // Now safe to check into the destination room
    const result = await api.processRfidScan(
      {
        student_rfid: state.rfid,
        action: 'checkin',
        room_id: roomId,
      },
      pin
    );

    logger.info(`${config.logLabel} check-in successful`, {
      action: result.action,
      room: result.room_name,
    });

    // Show special destination success modal with custom message
    const firstName = state.studentName.split(' ')[0];
    return {
      ...result,
      message: config.buildSuccessMessage(firstName),
      [config.resultFlag]: true, // Flag for special modal styling
    };
  } catch (error) {
    logger.error(`Failed to check into ${config.logLabel}`, { error: serializeError(error) });

    // Map error to user-friendly German message with network detection
    const errorMessage = error instanceof Error ? error.message : config.fallbackErrorMessage;
    const userFriendlyError = isNetworkRelatedError(error)
      ? config.networkErrorMessage
      : mapServerErrorToGerman(errorMessage);

    return {
      student_name: config.failTitle,
      student_id: state.studentId,
      action: 'error',
      message: userFriendlyError,
      showAsError: true,
    };
  }
};
