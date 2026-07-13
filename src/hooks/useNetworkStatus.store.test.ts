import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { api } from '../services/api';
import { useUserStore } from '../store/userStore';

import { useNetworkStatus } from './useNetworkStatus';

// Mock the api module
vi.mock('../services/api', () => ({
  api: {
    healthCheck: vi.fn(),
  },
}));

const mockHealthCheck = vi.mocked(api.healthCheck);

beforeEach(() => {
  vi.useFakeTimers();
  mockHealthCheck.mockReset();

  // Reset the store's network status to its initial value
  useUserStore.setState({
    networkStatus: {
      isOnline: true,
      responseTime: 0,
      lastChecked: Date.now(),
      quality: 'online',
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: flush all microtasks without running pending timers endlessly
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useNetworkStatus store integration', () => {
  describe('health check path', () => {
    it('writes health check results directly to the store', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      await flushMicrotasks();

      const storeStatus = useUserStore.getState().networkStatus;
      expect(storeStatus.isOnline).toBe(true);
      expect(storeStatus.quality).toBe('online');
      // The hook returns the store state, not a separate copy
      expect(result.current.networkStatus).toBe(storeStatus);
    });

    it('writes offline status to the store after all retries fail', async () => {
      mockHealthCheck.mockRejectedValue(new Error('Network error'));

      renderHook(() => useNetworkStatus());

      // Exhaust the 3 initial-check attempts (1000ms retry delay between each)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      const storeStatus = useUserStore.getState().networkStatus;
      expect(storeStatus.isOnline).toBe(false);
      expect(storeStatus.quality).toBe('offline');
    });
  });

  describe('API callback path', () => {
    it('updateNetworkQuality (registered as API callback) writes the same store state', () => {
      // App.tsx registers store.updateNetworkQuality via setNetworkStatusCallback
      useUserStore.getState().updateNetworkQuality('poor', 1500);

      const storeStatus = useUserStore.getState().networkStatus;
      expect(storeStatus.quality).toBe('poor');
      expect(storeStatus.responseTime).toBe(1500);
      expect(storeStatus.isOnline).toBe(true);
    });

    it('updateNetworkQuality with offline quality sets isOnline false', () => {
      useUserStore.getState().updateNetworkQuality('offline', 0);

      const storeStatus = useUserStore.getState().networkStatus;
      expect(storeStatus.quality).toBe('offline');
      expect(storeStatus.isOnline).toBe(false);
    });
  });

  describe('single source of truth', () => {
    it('hook return value reflects updates from the API callback path', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      // Health check path writes online
      await flushMicrotasks();
      expect(result.current.networkStatus.quality).toBe('online');

      // API callback path writes offline into the same store state
      act(() => {
        useUserStore.getState().updateNetworkQuality('offline', 0);
      });

      expect(result.current.networkStatus.quality).toBe('offline');
      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus).toBe(useUserStore.getState().networkStatus);
    });
  });
});
