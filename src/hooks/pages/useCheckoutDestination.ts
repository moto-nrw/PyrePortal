import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

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
  const [checkoutDestinationState, setDestinationState] = useState<CheckoutDestinationState | null>(
    null
  );
  // Keep the active chooser identity current even before React commits a state update.
  const destinationStateRef = useRef<CheckoutDestinationState | null>(null);
  const setCheckoutDestinationState: Dispatch<SetStateAction<CheckoutDestinationState | null>> =
    useCallback(value => {
      const nextState = typeof value === 'function' ? value(destinationStateRef.current) : value;
      destinationStateRef.current = nextState;
      setDestinationState(nextState);
    }, []);

  // A destination tap books once per chooser, even when the child taps twice.
  const bookingInFlight = useRef<CheckoutDestinationState | null>(null);
  const [pendingState, setPendingState] = useState<CheckoutDestinationState | null>(null);

  const book = async (
    run: (state: CheckoutDestinationState, pin: string) => Promise<RfidScanResult>
  ) => {
    if (
      !checkoutDestinationState ||
      !authenticatedUser?.pin ||
      bookingInFlight.current === checkoutDestinationState
    )
      return;
    bookingInFlight.current = checkoutDestinationState;
    setPendingState(checkoutDestinationState);
    const activeState = checkoutDestinationState;
    const activeScan = useUserStore.getState().rfid.currentScan;
    try {
      const result = await run(activeState, authenticatedUser.pin);
      // A timeout, a new scan, or another chooser invalidates this result.
      if (
        destinationStateRef.current !== activeState ||
        (activeScan && useUserStore.getState().rfid.currentScan !== activeScan)
      )
        return;
      setScanResult(result);
      setCheckoutDestinationState(null);
      showScanModal();
      // Modal will auto-close via useModalTimeout hook
    } finally {
      if (bookingInFlight.current === activeState) {
        bookingInFlight.current = null;
        setPendingState(null);
      }
    }
  };

  // Handle checkout destination selection (Schulhof, Toilette or Raumwechsel)
  const handleDestinationSelect = async (destination: CheckoutDestination) => {
    if (
      !checkoutDestinationState ||
      !authenticatedUser?.pin ||
      bookingInFlight.current === checkoutDestinationState
    )
      return;

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
    isBookingInFlight: () => bookingInFlight.current === checkoutDestinationState,
    isBookingPending: pendingState !== null && pendingState === checkoutDestinationState,
  };
}
