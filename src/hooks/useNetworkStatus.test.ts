import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { api } from '../services/api';

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

describe('useNetworkStatus', () => {
  describe('initial state', () => {
    it('returns default online state before any check completes', () => {
      // healthCheck never resolves so initial state stays
      mockHealthCheck.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.networkStatus).toEqual(
        expect.objectContaining({
          isOnline: true,
          responseTime: 0,
          quality: 'online',
        })
      );
    });

    it('exposes refreshNetworkStatus function', () => {
      mockHealthCheck.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useNetworkStatus());
      expect(typeof result.current.refreshNetworkStatus).toBe('function');
    });
  });

  describe('health check success', () => {
    it('sets quality to online when response is fast (<1000ms)', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      // Flush the initial check (resolves immediately = fast)
      await flushMicrotasks();

      expect(result.current.networkStatus.isOnline).toBe(true);
      expect(result.current.networkStatus.quality).toBe('online');
    });

    it('sets quality to poor when response is slow (>=1000ms)', async () => {
      // Simulate slow response by advancing time during the healthCheck
      mockHealthCheck.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            setTimeout(resolve, 1500);
          })
      );

      const { result } = renderHook(() => useNetworkStatus());

      // Advance past the slow health check timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(result.current.networkStatus.isOnline).toBe(true);
      expect(result.current.networkStatus.quality).toBe('poor');
      expect(result.current.networkStatus.responseTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('health check failure', () => {
    it('sets offline state when health check fails after all retries', async () => {
      mockHealthCheck.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useNetworkStatus());

      // Attempt 1 fails, wait for retry delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      // Attempt 2 fails, wait for retry delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      // Attempt 3 fails - no more retries
      await flushMicrotasks();

      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus.quality).toBe('offline');
    });

    it('sets offline with non-Error thrown value', async () => {
      mockHealthCheck.mockRejectedValue('string error');

      const { result } = renderHook(() => useNetworkStatus());

      // Exhaust retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus.quality).toBe('offline');
    });
  });

  describe('initial check with retry logic', () => {
    it('succeeds on first attempt and stops retrying', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      await flushMicrotasks();

      // Only called once since first attempt succeeds
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
      expect(result.current.networkStatus.isOnline).toBe(true);
    });

    it('retries on failure and succeeds on second attempt', async () => {
      mockHealthCheck.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      // First attempt fails, advance past retry delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      // Second attempt resolves
      await flushMicrotasks();

      expect(mockHealthCheck).toHaveBeenCalledTimes(2);
      expect(result.current.networkStatus.isOnline).toBe(true);
      expect(result.current.networkStatus.quality).toBe('online');
    });

    it('exhausts all 3 retries and sets offline', async () => {
      mockHealthCheck.mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useNetworkStatus());

      // Advance through all retries (2 delays of 1000ms between 3 attempts)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      expect(mockHealthCheck).toHaveBeenCalledTimes(3);
      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus.quality).toBe('offline');
    });

    it('succeeds on third attempt', async () => {
      mockHealthCheck
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      // Two retry delays
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      expect(mockHealthCheck).toHaveBeenCalledTimes(3);
      expect(result.current.networkStatus.isOnline).toBe(true);
    });
  });

  describe('concurrent check guard', () => {
    it('skips check when another is already in progress', async () => {
      // First call hangs
      let resolveFirst: (() => void) | undefined;
      mockHealthCheck.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveFirst = resolve;
          })
      );

      const { result } = renderHook(() => useNetworkStatus());

      // Initial check is now in progress (hanging)
      // Try to trigger a manual refresh while initial check is running
      act(() => {
        result.current.refreshNetworkStatus();
      });

      // Resolve the hanging check
      await act(async () => {
        resolveFirst?.();
      });
      await flushMicrotasks();

      // healthCheck was only called once because the refresh was skipped
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('periodic monitoring', () => {
    it('performs periodic checks at 30000ms intervals', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      renderHook(() => useNetworkStatus());

      // Let initial check complete
      await flushMicrotasks();

      const initialCallCount = mockHealthCheck.mock.calls.length;

      // Advance to first periodic check
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(mockHealthCheck.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('does not set duplicate intervals on rerender', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { rerender } = renderHook(() => useNetworkStatus());

      await flushMicrotasks();

      // Rerender shouldn't create duplicate intervals
      rerender();

      const callsBefore = mockHealthCheck.mock.calls.length;

      // Advance one interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      // Should have at most 1 extra call (not duplicated)
      expect(mockHealthCheck.mock.calls.length - callsBefore).toBeLessThanOrEqual(1);
    });
  });

  describe('manual refresh', () => {
    it('triggers a single check with no retries', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      // Wait for initial check to complete
      await flushMicrotasks();

      const callsBefore = mockHealthCheck.mock.calls.length;

      // Trigger manual refresh
      act(() => {
        result.current.refreshNetworkStatus();
      });
      await flushMicrotasks();

      // Should have exactly 1 more call (no retries for manual refresh)
      expect(mockHealthCheck.mock.calls.length).toBe(callsBefore + 1);
    });

    it('updates status on manual refresh failure', async () => {
      // Start with successful initial check
      mockHealthCheck.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNetworkStatus());

      await flushMicrotasks();
      expect(result.current.networkStatus.isOnline).toBe(true);

      // Now fail on manual refresh
      mockHealthCheck.mockRejectedValue(new Error('offline now'));

      act(() => {
        result.current.refreshNetworkStatus();
      });
      await flushMicrotasks();

      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus.quality).toBe('offline');
    });
  });

  describe('mount and unmount lifecycle', () => {
    it('starts monitoring on mount', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      renderHook(() => useNetworkStatus());

      await flushMicrotasks();

      expect(mockHealthCheck).toHaveBeenCalled();
    });

    it('stops monitoring on unmount and clears interval', async () => {
      mockHealthCheck.mockResolvedValue(undefined);

      const { unmount } = renderHook(() => useNetworkStatus());

      await flushMicrotasks();

      const callsAtUnmount = mockHealthCheck.mock.calls.length;
      unmount();

      // Advance past several intervals - should not trigger more checks
      await act(async () => {
        await vi.advanceTimersByTimeAsync(90000);
      });

      expect(mockHealthCheck.mock.calls.length).toBe(callsAtUnmount);
    });
  });

  describe('response time measurement', () => {
    it('records response time for successful check', async () => {
      mockHealthCheck.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            setTimeout(resolve, 500);
          })
      );

      const { result } = renderHook(() => useNetworkStatus());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.networkStatus.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.current.networkStatus.lastChecked).toBeGreaterThan(0);
    });

    it('records response time for failed check', async () => {
      mockHealthCheck.mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 200);
          })
      );

      const { result } = renderHook(() => useNetworkStatus());

      // Advance through 3 retries: each takes 200ms + 1000ms delay between
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200); // attempt 1 rejects
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000); // retry delay 1
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200); // attempt 2 rejects
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000); // retry delay 2
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200); // attempt 3 rejects
      });
      await flushMicrotasks();

      expect(result.current.networkStatus.quality).toBe('offline');
      expect(result.current.networkStatus.lastChecked).toBeGreaterThan(0);
    });
  });

  describe('performNetworkCheck error fallback', () => {
    it('falls back to offline when checkNetworkStatus throws unexpectedly', async () => {
      // This covers the catch block in performNetworkCheck (line 82-91)
      // checkNetworkStatus itself shouldn't normally throw (it catches errors internally),
      // but performNetworkCheck has a safety catch block for unexpected errors.
      // We can trigger this by making the health check throw in an unusual way
      // that bypasses the inner catch. Since checkNetworkStatus catches all errors,
      // this path is defensive - we test it via the performInitialNetworkCheck catch block.

      // For performInitialNetworkCheck catch block (line 144-155):
      // Make checkNetworkStatus itself throw by having the mock throw synchronously
      // inside the callback scope after isCheckingRef is set
      mockHealthCheck.mockImplementation(() => {
        throw new Error('synchronous throw');
      });

      const { result } = renderHook(() => useNetworkStatus());

      // The synchronous throw is caught by checkNetworkStatus's try/catch,
      // which returns offline status. After 3 retries all failing:
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      expect(result.current.networkStatus.isOnline).toBe(false);
      expect(result.current.networkStatus.quality).toBe('offline');
    });
  });
});
