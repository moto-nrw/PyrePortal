import type { ModalAction } from '../../ui/modal/types';

import {
  SCAN_MODAL_TIMEOUTS,
  SCAN_VARIANT_COLORS,
  VARIANT_TO_TONE,
  type ScanModalCallbacks,
  type ScanModalModel,
  type ScanModalState,
  type ScanModalVariant,
} from './types';

/**
 * Pure function that maps scan state to modal configuration.
 *
 * This function contains all the business logic for determining:
 * - Which modal variant to show
 * - What title and body content to display
 * - What actions are available
 * - Timeout durations
 * - Custom colors
 *
 * @param state - Current scan state including currentScan, dailyCheckoutState, etc.
 * @param callbacks - Callbacks for handling user actions
 * @returns Modal configuration, or null if no modal should be shown
 *
 * @example
 * const model = getScanModalModel(
 *   { currentScan, dailyCheckoutState, checkoutDestinationState, showFeedbackPrompt },
 *   { onDailyCheckoutConfirm, onDailyCheckoutDecline, onFeedbackSubmit, onDestinationSelect, isSchulhofAvailable }
 * );
 */
export function getScanModalModel(
  state: ScanModalState,
  callbacks: ScanModalCallbacks
): ScanModalModel | null {
  const {
    currentScan,
    dailyCheckoutState,
    checkoutDestinationState,
    showFeedbackPrompt,
    roomName,
  } = state;

  // No modal if no scan
  if (!currentScan) return null;

  // Priority 1: Feedback prompt (during daily checkout flow)
  if (showFeedbackPrompt && dailyCheckoutState) {
    return createFeedbackPromptModel(dailyCheckoutState.studentName, callbacks);
  }

  // Priority 2: Daily checkout confirmation or farewell
  if (dailyCheckoutState) {
    if (dailyCheckoutState.showingFarewell) {
      return createFarewellModel(dailyCheckoutState.studentName);
    }
    return createDailyCheckoutConfirmationModel(dailyCheckoutState.studentName, callbacks);
  }

  // Priority 3: Destination selection (after checkout)
  if (currentScan.action === 'checked_out' && checkoutDestinationState) {
    return createDestinationSelectionModel(
      checkoutDestinationState.studentName,
      callbacks.isSchulhofAvailable,
      callbacks
    );
  }

  // Priority 4: Standard scan result modals
  return createStandardScanModal(currentScan, roomName);
}

/**
 * Creates modal model for standard scan results (check-in, check-out, transfer, error, etc.)
 */
function createStandardScanModal(
  scan: ScanModalState['currentScan'],
  roomName?: string
): ScanModalModel | null {
  if (!scan) return null;

  // Determine variant based on scan result
  const variant = determineVariant(scan);
  const colors = SCAN_VARIANT_COLORS[variant];
  const tone = VARIANT_TO_TONE[variant];

  // Get title
  const title = getTitle(scan, variant);

  // Get body content
  const body = getBody(scan, variant, roomName);

  return {
    variant,
    tone,
    title,
    body,
    autoCloseMs: SCAN_MODAL_TIMEOUTS.STANDARD,
    customColors: colors,
    showProgress: true,
    progressDuration: SCAN_MODAL_TIMEOUTS.STANDARD,
  };
}

/**
 * Determines the modal variant based on scan result.
 */
function determineVariant(scan: ScanModalState['currentScan']): ScanModalVariant {
  if (!scan) return 'info';

  // Error state
  if (scan.showAsError) return 'error';

  // Info state (already_in, etc.)
  if (scan.isInfo) return 'info';

  // Supervisor authentication
  if (scan.action === 'supervisor_authenticated') return 'supervisor';

  // Schulhof check-in
  if (scan.isSchulhof) return 'schulhof';

  // Standard actions
  switch (scan.action) {
    case 'checked_in':
      return 'checkIn';
    case 'checked_out':
      return 'checkOut';
    case 'transferred':
      return 'transfer';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Gets the modal title based on scan result and variant.
 */
function getTitle(scan: ScanModalState['currentScan'], variant: ScanModalVariant): string {
  if (!scan) return '';

  // Error/Info states use message or student_name as title
  if (variant === 'error' || variant === 'info') {
    return scan.message ?? scan.student_name;
  }

  // Supervisor authentication
  if (variant === 'supervisor') {
    if (scan.message) return scan.message;
    return `${scan.student_name} ist jetzt Betreuer`;
  }

  // Schulhof - use custom message
  if (variant === 'schulhof' && scan.message) {
    return scan.message;
  }

  // Standard greetings
  switch (scan.action) {
    case 'checked_in':
      return `Hallo, ${scan.student_name}!`;
    case 'checked_out':
      return `Tschüss, ${scan.student_name}!`;
    case 'transferred':
      return `Hallo, ${scan.student_name}!`;
    default:
      return scan.student_name;
  }
}

/**
 * Gets the modal body content based on scan result and variant.
 */
function getBody(
  scan: ScanModalState['currentScan'],
  variant: ScanModalVariant,
  roomName?: string
): string {
  if (!scan) return '';

  // Schulhof - no body content (title only)
  if (variant === 'schulhof') {
    return '';
  }

  // Error/Info - no additional body (message is in title)
  if (variant === 'error' || variant === 'info' || variant === 'supervisor') {
    return '';
  }

  // Standard body content
  switch (scan.action) {
    case 'checked_in':
      return `Du bist jetzt in ${scan.room_name ?? roomName ?? 'diesem Raum'} eingecheckt`;
    case 'checked_out':
      return 'Du bist jetzt ausgecheckt';
    case 'transferred':
      return 'Raumwechsel erfolgreich';
    default:
      return '';
  }
}

/**
 * Creates modal model for daily checkout confirmation.
 */
function createDailyCheckoutConfirmationModel(
  studentName: string,
  callbacks: ScanModalCallbacks
): ScanModalModel {
  const confirmAction: ModalAction = {
    label: 'Ja, nach Hause',
    onClick: callbacks.onDailyCheckoutConfirm,
    variant: 'primary',
    closesModal: false, // We handle navigation ourselves
  };

  const declineAction: ModalAction = {
    label: 'Nein',
    onClick: callbacks.onDailyCheckoutDecline,
    variant: 'secondary',
    closesModal: true,
  };

  return {
    variant: 'dailyCheckoutConfirmation',
    tone: 'info',
    title: 'Gehst du nach Hause?',
    body: studentName,
    actions: [confirmAction, declineAction],
    autoCloseMs: SCAN_MODAL_TIMEOUTS.DAILY_CHECKOUT,
    customColors: SCAN_VARIANT_COLORS.dailyCheckoutConfirmation,
    showProgress: true,
    progressDuration: SCAN_MODAL_TIMEOUTS.DAILY_CHECKOUT,
  };
}

/**
 * Creates modal model for farewell message.
 */
function createFarewellModel(studentName: string): ScanModalModel {
  const firstName = studentName.split(' ')[0];

  return {
    variant: 'dailyCheckoutFarewell',
    tone: 'info',
    title: `Auf Wiedersehen, ${firstName}!`,
    autoCloseMs: SCAN_MODAL_TIMEOUTS.FAREWELL,
    customColors: SCAN_VARIANT_COLORS.dailyCheckoutFarewell,
    showProgress: true,
    progressDuration: SCAN_MODAL_TIMEOUTS.FAREWELL,
  };
}

/**
 * Creates modal model for feedback prompt.
 */
function createFeedbackPromptModel(
  studentName: string,
  callbacks: ScanModalCallbacks
): ScanModalModel {
  const feedbackActions: ModalAction[] = [
    {
      label: 'Gut',
      onClick: () => callbacks.onFeedbackSubmit('positive'),
      variant: 'primary',
      style: {
        backgroundColor: 'rgba(16, 185, 129, 0.3)',
        borderColor: 'rgba(16, 185, 129, 0.7)',
      },
      hoverStyle: {
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
      },
    },
    {
      label: 'Okay',
      onClick: () => callbacks.onFeedbackSubmit('neutral'),
      variant: 'primary',
      style: {
        backgroundColor: 'rgba(245, 158, 11, 0.3)',
        borderColor: 'rgba(245, 158, 11, 0.7)',
      },
      hoverStyle: {
        backgroundColor: 'rgba(245, 158, 11, 0.5)',
      },
    },
    {
      label: 'Schlecht',
      onClick: () => callbacks.onFeedbackSubmit('negative'),
      variant: 'primary',
      style: {
        backgroundColor: 'rgba(239, 68, 68, 0.3)',
        borderColor: 'rgba(239, 68, 68, 0.7)',
      },
      hoverStyle: {
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
      },
    },
  ];

  return {
    variant: 'feedbackPrompt',
    tone: 'info',
    title: 'Wie war dein Tag?',
    body: studentName,
    actions: feedbackActions,
    autoCloseMs: SCAN_MODAL_TIMEOUTS.FEEDBACK_PROMPT,
    customColors: SCAN_VARIANT_COLORS.feedbackPrompt,
    showProgress: true,
    progressDuration: SCAN_MODAL_TIMEOUTS.FEEDBACK_PROMPT,
  };
}

/**
 * Creates modal model for destination selection.
 */
function createDestinationSelectionModel(
  studentName: string,
  isSchulhofAvailable: boolean,
  callbacks: ScanModalCallbacks
): ScanModalModel {
  const actions: ModalAction[] = [
    {
      label: 'Raumwechsel',
      onClick: () => callbacks.onDestinationSelect('raumwechsel'),
      variant: 'primary',
      closesModal: true,
    },
  ];

  if (isSchulhofAvailable) {
    actions.push({
      label: 'Schulhof',
      onClick: () => callbacks.onDestinationSelect('schulhof'),
      variant: 'primary',
      closesModal: false, // We need to process the Schulhof check-in
    });
  }

  return {
    variant: 'destinationSelection',
    tone: 'warning',
    title: `Wohin gehst du, ${studentName.split(' ')[0]}?`,
    actions,
    autoCloseMs: SCAN_MODAL_TIMEOUTS.DESTINATION_SELECTION,
    customColors: SCAN_VARIANT_COLORS.destinationSelection,
    showProgress: true,
    progressDuration: SCAN_MODAL_TIMEOUTS.DESTINATION_SELECTION,
  };
}
