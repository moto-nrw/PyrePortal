import { useState } from 'react';

import { createLogger, serializeError } from '../../utils/logger';
import { isRfidEnabled, safeInvoke } from '../../utils/tauriContext';

import BackButton from './BackButton';
import { ErrorModal } from './ErrorModal';
import { SuccessModal } from './SuccessModal';

const logger = createLogger('ScannerRestartButton');

const SCANNER_RECOVERY_TIMEOUT_MS = 8000;

const withTimeout = <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutHandle);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });

interface ScannerRestartButtonProps {
  /** Called before recovery starts (e.g. to stop active scanning) */
  onBeforeRecover?: () => Promise<void>;
  /** Called after successful recovery (e.g. to restart scanning) */
  onAfterRecover?: () => Promise<void>;
}

/**
 * Self-contained scanner restart button with recovery logic and feedback modals.
 * Renders as a fixed-position button at bottom-center of the screen.
 */
export function ScannerRestartButton({
  onBeforeRecover,
  onAfterRecover,
}: ScannerRestartButtonProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const handleRecover = async () => {
    if (isRecovering) return;

    setIsRecovering(true);
    try {
      if (onBeforeRecover) {
        await onBeforeRecover();
      }

      if (isRfidEnabled()) {
        await withTimeout(
          safeInvoke('recover_rfid_scanner'),
          SCANNER_RECOVERY_TIMEOUT_MS,
          'Scanner-Recovery Zeitüberschreitung'
        );

        const status = await safeInvoke<{ is_available: boolean; last_error?: string }>(
          'get_rfid_scanner_status'
        );
        if (!status?.is_available) {
          throw new Error(status?.last_error ?? 'Scanner antwortet nach Recovery nicht');
        }
      }

      if (onAfterRecover) {
        await onAfterRecover();

        // Verify the scanning service actually started — startScanning()
        // catches errors internally, so check service state explicitly.
        if (isRfidEnabled()) {
          const serviceStatus = await safeInvoke<{ is_running: boolean }>(
            'get_rfid_service_status'
          );
          if (!serviceStatus?.is_running) {
            throw new Error('Scanner-Service läuft nach Recovery nicht');
          }
        }
      }

      logger.info('RFID scanner recovered');
      setShowSuccessModal(true);
    } catch (error) {
      logger.error('RFID scanner recovery failed', { error: serializeError(error) });
      setShowErrorModal(true);
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
        }}
      >
        <BackButton
          onClick={() => {
            void handleRecover();
          }}
          disabled={isRecovering}
          text={isRecovering ? 'Starte neu...' : 'Scanner neu starten'}
          icon="restart"
          color="blue"
          ariaLabel="Scanner neu starten"
        />
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        message="Scanner wurde erfolgreich neu gestartet."
        autoCloseDelay={2200}
      />

      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message="Scanner konnte nicht neu gestartet werden. Bitte Gerät vom Strom trennen und neu starten – die Session bleibt erhalten."
        autoCloseDelay={6000}
      />
    </>
  );
}
