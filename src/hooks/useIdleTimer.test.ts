import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useIdleTimer } from './useIdleTimer';

// Mock useUserStore before importing the hook
const mockCurrentScan = { current: null as string | null };

vi.mock('../store/userStore', () => ({
  useUserStore: vi.fn((selector: (s: { rfid: { currentScan: string | null } }) => unknown) =>
    selector({ rfid: { currentScan: mockCurrentScan.current } })
  ),
}));

const IDLE_TIMEOUT_MS = 180_000;

beforeEach(() => {
  vi.useFakeTimers();
  mockCurrentScan.current = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useIdleTimer', () => {
  it('starts not dimmed', () => {
    const { result } = renderHook(() => useIdleTimer());
    expect(result.current.isDimmed).toBe(false);
  });

  it('becomes dimmed after idle timeout', () => {
    const { result } = renderHook(() => useIdleTimer());

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS));
    expect(result.current.isDimmed).toBe(true);
  });

  it('does not dim before timeout', () => {
    const { result } = renderHook(() => useIdleTimer());

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1));
    expect(result.current.isDimmed).toBe(false);
  });

  it('resets on pointerdown event', () => {
    const { result } = renderHook(() => useIdleTimer());

    // Advance close to timeout
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000));

    // Simulate pointer interaction
    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });

    // Advance past original timeout — should NOT be dimmed (timer was reset)
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isDimmed).toBe(false);
  });

  it('resets on keydown event', () => {
    const { result } = renderHook(() => useIdleTimer());

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000));

    act(() => {
      document.dispatchEvent(new Event('keydown'));
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isDimmed).toBe(false);
  });

  it('wakes immediately when dimmed and interaction occurs', () => {
    const { result } = renderHook(() => useIdleTimer());

    // Let it dim
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS));
    expect(result.current.isDimmed).toBe(true);

    // Touch wakes it
    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(result.current.isDimmed).toBe(false);
  });

  it('resets idle via resetIdle function', () => {
    const { result } = renderHook(() => useIdleTimer());

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000));

    act(() => result.current.resetIdle());

    // Timer restarted — should not dim yet
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isDimmed).toBe(false);

    // But dims again after full timeout from reset
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS));
    expect(result.current.isDimmed).toBe(true);
  });

  it('resets when RFID scan changes', () => {
    const { result, rerender } = renderHook(() => useIdleTimer());

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000));

    // Simulate an RFID scan changing
    mockCurrentScan.current = 'some-scan-id';
    rerender();

    // Timer was reset — should not dim after original timeout
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isDimmed).toBe(false);
  });

  it('cleans up event listeners and timeout on unmount', () => {
    const { result, unmount } = renderHook(() => useIdleTimer());

    unmount();

    // After unmount, advancing timers should not cause errors
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2));
    // isDimmed stays false since hook is unmounted
    expect(result.current.isDimmed).toBe(false);
  });

  it('returns resetIdle as a stable function', () => {
    const { result, rerender } = renderHook(() => useIdleTimer());
    const firstResetIdle = result.current.resetIdle;
    rerender();
    expect(result.current.resetIdle).toBe(firstResetIdle);
  });
});
