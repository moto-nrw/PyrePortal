import { createLogger, serializeError } from '../utils/logger';

import {
  api,
  formatRoomName,
  getNetworkErrorMessage,
  isNetworkRelatedError,
  mapApiErrorToGerman,
  mapServerErrorToGerman,
  type RfidScanResult,
  type Room,
} from './api';

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
type DestinationRoomKey = 'schulhof' | 'toilette';

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
    networkErrorMessage: getNetworkErrorMessage('schulhofCheckin'),
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
    networkErrorMessage: getNetworkErrorMessage('toiletteCheckin'),
  },
};

export interface CheckInToDestinationParams {
  destination: DestinationRoomKey;
  roomId: number | null;
  state: CheckoutDestinationState;
  pin: string;
  staffId?: number;
}

/**
 * Checks a student into a destination room (Schulhof or Toilette) after checkout.
 *
 * The destination chooser is shown only after the triggering server scan
 * completes. There is no background attendance write to wait for.
 *
 * Returns the scan result to display (success with destination flag, or a
 * visible error result). Never throws.
 */
export const checkInToDestinationRoom = async (
  params: CheckInToDestinationParams
): Promise<RfidScanResult> => {
  const { destination, roomId, state, pin, staffId } = params;
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

    const result = await api.processRfidScan(
      {
        student_rfid: state.rfid,
        action: 'checkin',
        room_id: roomId,
      },
      pin,
      staffId
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

/** Rooms offered as their own destination buttons after checkout. */
export type OpenRoomDestination = Pick<Room, 'id' | 'name'>;

/**
 * Released rooms a child may choose as destination (project-phoenix #3067).
 * The Schulhof keeps its own button and check-in flow, the toilet its own
 * button, and the room the child is leaving is no destination.
 */
export const selectOpenRoomDestinations = (
  rooms: readonly Room[],
  currentRoomId: number | null | undefined,
  isToiletRoom: (name: string) => boolean
): OpenRoomDestination[] =>
  rooms
    .filter(
      room =>
        room.is_open_room === true &&
        room.is_schulhof !== true &&
        room.name !== 'Schulhof' &&
        !isToiletRoom(room.name) &&
        room.id !== currentRoomId
    )
    .map(room => ({ id: room.id, name: room.name }));

export interface MoveToOpenRoomParams {
  room: OpenRoomDestination;
  state: CheckoutDestinationState;
  pin: string;
  staffId?: number;
}

/**
 * Books the student into a released room chosen at this kiosk. The backend
 * records an independent stay there: no device, second scan or supervision
 * is needed in that room.
 *
 * Returns the scan result to display (success flagged isOpenRoom, or a
 * visible error result). Never throws.
 */
export const moveToOpenRoom = async (params: MoveToOpenRoomParams): Promise<RfidScanResult> => {
  const { room, state, pin, staffId } = params;

  try {
    logger.info('Booking student into open room', { rfid: state.rfid, roomId: room.id });

    const result = await api.moveToOpenRoom(
      { student_rfid: state.rfid, room_id: room.id },
      pin,
      staffId
    );

    logger.info('Open room booking successful', { roomId: result.room_id, moved: result.moved });

    const firstName = state.studentName.split(' ')[0];
    return {
      student_id: result.student_id,
      student_name: result.student_name,
      action: result.action,
      room_name: result.room_name,
      processed_at: result.processed_at,
      message: `${firstName} ist jetzt in ${formatRoomName(result.room_name || room.name)}`,
      isOpenRoom: true,
    };
  } catch (error) {
    logger.error('Failed to book open room', { roomId: room.id, error: serializeError(error) });

    return {
      student_name: `${formatRoomName(room.name)}: Wechsel fehlgeschlagen`,
      student_id: state.studentId,
      action: 'error',
      message: isNetworkRelatedError(error)
        ? getNetworkErrorMessage('openRoomCheckin')
        : mapApiErrorToGerman(error),
      showAsError: true,
    };
  }
};
