import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';

import { ModalBase } from './ui';

/** The notice stays long enough to be read by someone who walks up. */
export const KIOSK_NOTICE_TIMEOUT_MS = 15_000;

/**
 * Shows the store's kiosk notice above every page, such as why the kiosk
 * left the scanning page or logged out. Closes on a tap beside it or after a while.
 */
export function KioskNotice() {
  const kioskNotice = useUserStore(state => state.kioskNotice);
  const dismissKioskNotice = useUserStore(state => state.dismissKioskNotice);

  return (
    <ModalBase
      isOpen={kioskNotice !== null}
      onClose={dismissKioskNotice}
      size="sm"
      backgroundColor={designSystem.colors.white}
      timeout={KIOSK_NOTICE_TIMEOUT_MS}
      timeoutResetKey={kioskNotice ? `${kioskNotice.title}:${kioskNotice.message}` : null}
    >
      <div
        style={{ marginBottom: designSystem.spacing.lg, color: designSystem.pastel.blue.accent }}
      >
        <FontAwesomeIcon icon={faCircleInfo} style={{ fontSize: '3rem' }} />
      </div>
      <h2
        style={{
          fontSize: designSystem.fonts.size.xl,
          fontWeight: designSystem.fonts.weight.bold,
          marginBottom: designSystem.spacing.lg,
          color: designSystem.colors.textStrong,
        }}
      >
        {kioskNotice?.title}
      </h2>
      <p
        style={{
          fontSize: designSystem.fonts.size.large,
          color: designSystem.colors.textSubtle,
          lineHeight: 1.5,
        }}
      >
        {kioskNotice?.message}
      </p>
    </ModalBase>
  );
}
