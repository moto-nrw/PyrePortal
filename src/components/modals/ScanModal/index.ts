/**
 * ScanModal - Domain-specific modal for RFID scanning scenarios.
 *
 * Implements model-driven rendering where:
 * 1. getScanModalModel() produces a ScanModalModel from current state
 * 2. ScanModal renders the model
 *
 * This separation enables:
 * - Unit testing of modal logic without React
 * - Clear separation of business logic and presentation
 * - Explicit modal state transitions
 *
 * @example
 * import { ScanModal, getScanModalModel } from '../components/modals/ScanModal';
 *
 * const model = getScanModalModel(state, callbacks);
 *
 * <ScanModal
 *   model={model}
 *   isOpen={showModal}
 *   onClose={handleClose}
 *   callbacks={callbacks}
 * />
 */

export { ScanModal, type ScanModalProps } from './ScanModal';
export { getScanModalModel } from './getScanModalModel';
export {
  type ScanModalVariant,
  type ScanModalModel,
  type ScanModalState,
  type ScanModalCallbacks,
  type DailyCheckoutState,
  type CheckoutDestinationState,
  type ExtendedScanResult,
  SCAN_MODAL_TIMEOUTS,
  SCAN_VARIANT_COLORS,
  VARIANT_TO_TONE,
} from './types';
