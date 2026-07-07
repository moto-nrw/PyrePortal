import type { NetworkStatusData } from '../../types/network';
import type { SetState, UserState } from '../userStore';

export const createNetworkSlice = (set: SetState<UserState>) => ({
  // Network status initial state
  networkStatus: {
    isOnline: true,
    responseTime: 0,
    lastChecked: Date.now(),
    quality: 'online' as const,
  },

  // Network status actions
  setNetworkStatus: (status: NetworkStatusData) => {
    set({ networkStatus: status });
  },

  updateNetworkQuality: (quality: NetworkStatusData['quality'], responseTime: number) => {
    set(state => ({
      networkStatus: {
        ...state.networkStatus,
        quality,
        responseTime,
        lastChecked: Date.now(),
        isOnline: quality !== 'offline',
      },
    }));
  },
});
