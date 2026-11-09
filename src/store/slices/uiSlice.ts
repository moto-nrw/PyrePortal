import type { SetState, UserState } from '../userStore';

/**
 * A notice the app shows above every page. It tells staff why the kiosk left
 * the screen they were on, for example after the server ended the session.
 */
export interface KioskNotice {
  title: string;
  message: string;
}

// UI request state (isLoading/error). Written by other slices via the shared set().
export const createUiSlice = (set: SetState<UserState>) => ({
  // Initial state
  isLoading: false,
  error: null,
  kioskNotice: null as KioskNotice | null,

  dismissKioskNotice: () => set({ kioskNotice: null }),
});
