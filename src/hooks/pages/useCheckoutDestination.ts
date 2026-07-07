import { useState } from 'react';

import {
  checkInToDestinationRoom,
  type CheckoutDestinationState,
} from '../../services/checkoutDestinationService';
import { useUserStore } from '../../store/userStore';

export type CheckoutDestination = 'schulhof' | 'raumwechsel' | 'toilette';

interface UseCheckoutDestinationParams {
  schulhofRoomId: number | null;
  wcRoomId: number | null;
}

/**
 * Checkout destination flow (unified: Raumwechsel, Schulhof, Toilette).
 *
 * Holds the destination modal state and performs the destination room
 * check-in through the checkout destination service. The service waits for
 * the background checkout sync of the triggering scan before checking in.
 */
export function useCheckoutDestination({ schulhofRoomId, wcRoomId }: UseCheckoutDestinationParams) {
  const { authenticatedUser, setScanResult, showScanModal } = useUserStore();
  const { recentTagScans } = useUserStore(state => state.rfid);

  // State for checkout destination selection (unified: Raumwechsel, Schulhof, nach Hause)
  const [checkoutDestinationState, setCheckoutDestinationState] =
    useState<CheckoutDestinationState | null>(null);

  // Handle checkout destination selection (Schulhof, Toilette or Raumwechsel)
  const handleDestinationSelect = async (destination: CheckoutDestination) => {
    if (!checkoutDestinationState || !authenticatedUser?.pin) return;

    if (destination === 'raumwechsel') {
      // Clear destination state - student will scan at destination room
      setCheckoutDestinationState(null);
      return;
    }

    const result = await checkInToDestinationRoom({
      destination,
      roomId: destination === 'schulhof' ? schulhofRoomId : wcRoomId,
      state: checkoutDestinationState,
      pin: authenticatedUser.pin,
      recentTagScans,
    });

    setScanResult(result);
    setCheckoutDestinationState(null);
    showScanModal();
    // Modal will auto-close via useModalTimeout hook
  };

  return {
    checkoutDestinationState,
    setCheckoutDestinationState,
    handleDestinationSelect,
  };
}
