import { useRef, useState } from 'react';

import type { RfidScanResult } from '../../services/api';
import {
  checkInToDestinationRoom,
  moveToOpenRoom,
  type CheckoutDestinationState,
  type OpenRoomDestination,
} from '../../services/checkoutDestinationService';
import { resolveStaffAttributionId } from '../../store/slices/authSlice';
import { useUserStore } from '../../store/userStore';

export type CheckoutDestination = 'schulhof' | 'raumwechsel' | 'toilette';

interface UseCheckoutDestinationParams {
  schulhofRoomId: number | null;
  wcRoomId: number | null;
}

/**
 * Checkout destination flow (unified: Raumwechsel, Schulhof, Toilette and
 * released rooms).
 *
 * Holds the destination modal state and performs the destination booking
 * through the checkout destination service after the server scan completes.
 * One booking runs at a time: a second tap while it is in flight is ignored.
 */
export function useCheckoutDestination({ schulhofRoomId, wcRoomId }: UseCheckoutDestinationParams) {
  const { authenticatedUser, selectedSupervisors, setScanResult, showScanModal } = useUserStore();

  // State for checkout destination selection (unified: Raumwechsel, Schulhof, nach Hause)
  const [checkoutDestinationState, setCheckoutDestinationState] =
    useState<CheckoutDestinationState | null>(null);

  // A destination tap books once, even when the child taps twice.
  const bookingInFlight = useRef(false);

  const book = async (
    run: (state: CheckoutDestinationState, pin: string) => Promise<RfidScanResult>
  ) => {
    if (!checkoutDestinationState || !authenticatedUser?.pin || bookingInFlight.current) return;
    bookingInFlight.current = true;
    try {
      const result = await run(checkoutDestinationState, authenticatedUser.pin);
      setScanResult(result);
      setCheckoutDestinationState(null);
      showScanModal();
      // Modal will auto-close via useModalTimeout hook
    } finally {
      bookingInFlight.current = false;
    }
  };

  // Handle checkout destination selection (Schulhof, Toilette or Raumwechsel)
  const handleDestinationSelect = async (destination: CheckoutDestination) => {
    if (!checkoutDestinationState || !authenticatedUser?.pin) return;

    if (destination === 'raumwechsel') {
      // Clear destination state - student will scan at destination room
      setCheckoutDestinationState(null);
      return;
    }

    await book((state, pin) =>
      checkInToDestinationRoom({
        destination,
        roomId: destination === 'schulhof' ? schulhofRoomId : wcRoomId,
        state,
        pin,
        staffId: resolveStaffAttributionId(authenticatedUser, selectedSupervisors),
      })
    );
  };

  // Handle a released room: the stay is booked here, the room needs no device.
  const handleOpenRoomSelect = async (room: OpenRoomDestination) => {
    if (!authenticatedUser) return;
    await book((state, pin) =>
      moveToOpenRoom({
        room,
        state,
        pin,
        staffId: resolveStaffAttributionId(authenticatedUser, selectedSupervisors),
      })
    );
  };

  return {
    checkoutDestinationState,
    setCheckoutDestinationState,
    handleDestinationSelect,
    handleOpenRoomSelect,
  };
}
