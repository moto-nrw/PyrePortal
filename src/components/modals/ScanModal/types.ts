import type { ReactNode } from 'react';

import type { DailyFeedbackRating, RfidScanResult } from '../../../services/api';
import type { ModalAction, ModalIcon, ModalTone } from '../../ui/modal/types';

/**
 * Scan modal variant types - all possible modal states in the RFID scanning flow.
 */
export type ScanModalVariant =
  | 'checkIn'
  | 'checkOut'
  | 'transfer'
  | 'schulhof'
  | 'error'
  | 'info'
  | 'supervisor'
  | 'dailyCheckoutConfirmation'
  | 'dailyCheckoutFarewell'
  | 'feedbackPrompt'
  | 'destinationSelection';

/**
 * ScanModalModel - Configuration object returned by getScanModalModel.
 * Represents the complete state needed to render a scan modal.
 */
export interface ScanModalModel {
  /** Which variant of scan modal to show */
  variant: ScanModalVariant;
  /** Semantic tone for base styling */
  tone: ModalTone;
  /** Icon to display (FontAwesome or ReactNode) */
  icon?: ModalIcon;
  /** Modal title */
  title: string;
  /** Body content (text or ReactNode) */
  body?: ReactNode;
  /** Action buttons */
  actions?: ModalAction[];
  /** Auto-close after this many milliseconds */
  autoCloseMs?: number;
  /** Custom color overrides */
  customColors?: { primary: string; background: string };
  /** Whether to show progress indicator */
  showProgress?: boolean;
  /** Duration for progress animation (defaults to autoCloseMs) */
  progressDuration?: number;
  /** Route to navigate to when modal closes */
  navigateOnClose?: string;
}

/**
 * Daily checkout state - tracks the flow of daily checkout interactions.
 */
export interface DailyCheckoutState {
  /** RFID tag that triggered the checkout */
  rfid: string;
  /** Student's full name */
  studentName: string;
  /** Whether showing the farewell message */
  showingFarewell: boolean;
}

/**
 * Checkout destination state - tracks destination selection after checkout.
 */
export interface CheckoutDestinationState {
  /** RFID tag */
  rfid: string;
  /** Student's full name */
  studentName: string;
  /** Student ID (if available) */
  studentId: number | null;
}

/**
 * Callbacks passed to getScanModalModel for handling user actions.
 */
export interface ScanModalCallbacks {
  /** Called when daily checkout is confirmed (yes, going home) */
  onDailyCheckoutConfirm: () => void;
  /** Called when daily checkout is declined (no, room change) */
  onDailyCheckoutDecline: () => void;
  /** Called when feedback is submitted */
  onFeedbackSubmit: (rating: DailyFeedbackRating) => void;
  /** Called when destination is selected (schulhof or raumwechsel) */
  onDestinationSelect: (destination: 'schulhof' | 'raumwechsel') => void;
  /** Whether Schulhof room is available */
  isSchulhofAvailable: boolean;
}

/**
 * Extended RfidScanResult with additional flags used by the modal system.
 */
export interface ExtendedScanResult extends RfidScanResult {
  /** Flag for Schulhof check-in (special yellow styling) */
  isSchulhof?: boolean;
  /** Flag for error display */
  showAsError?: boolean;
  /** Flag for info display */
  isInfo?: boolean;
}

/**
 * Input state for getScanModalModel.
 */
export interface ScanModalState {
  /** Current scan result */
  currentScan: ExtendedScanResult | null;
  /** Daily checkout state (if in daily checkout flow) */
  dailyCheckoutState: DailyCheckoutState | null;
  /** Checkout destination state (if selecting destination) */
  checkoutDestinationState: CheckoutDestinationState | null;
  /** Whether showing feedback prompt */
  showFeedbackPrompt: boolean;
  /** Current room name */
  roomName?: string;
}

/**
 * Timeout constants for different modal states.
 */
export const SCAN_MODAL_TIMEOUTS = {
  /** Standard check-in/check-out display time */
  STANDARD: 3000,
  /** Error display time */
  ERROR: 3000,
  /** Daily checkout confirmation timeout */
  DAILY_CHECKOUT: 7000,
  /** Farewell message display time */
  FAREWELL: 2000,
  /** Feedback prompt timeout */
  FEEDBACK_PROMPT: 7000,
  /** Destination selection timeout */
  DESTINATION_SELECTION: 7000,
} as const;

/**
 * Color mappings for scan modal variants.
 */
export const SCAN_VARIANT_COLORS: Record<
  ScanModalVariant,
  { primary: string; background: string }
> = {
  checkIn: { primary: '#83cd2d', background: '#83cd2d' },
  transfer: { primary: '#83cd2d', background: '#83cd2d' },
  checkOut: { primary: '#f87C10', background: '#f87C10' },
  destinationSelection: { primary: '#f87C10', background: '#f87C10' },
  schulhof: { primary: '#F59E0B', background: '#F59E0B' },
  error: { primary: '#ef4444', background: '#ef4444' },
  supervisor: { primary: '#3B82F6', background: '#3B82F6' },
  dailyCheckoutConfirmation: { primary: '#6366f1', background: '#6366f1' },
  dailyCheckoutFarewell: { primary: '#6366f1', background: '#6366f1' },
  feedbackPrompt: { primary: '#6366f1', background: '#6366f1' },
  info: { primary: '#6366f1', background: '#6366f1' },
};

/**
 * Maps scan modal variants to semantic tones.
 */
export const VARIANT_TO_TONE: Record<ScanModalVariant, ModalTone> = {
  checkIn: 'success',
  transfer: 'success',
  checkOut: 'warning',
  destinationSelection: 'warning',
  schulhof: 'warning',
  error: 'error',
  supervisor: 'info',
  dailyCheckoutConfirmation: 'info',
  dailyCheckoutFarewell: 'info',
  feedbackPrompt: 'info',
  info: 'info',
};
