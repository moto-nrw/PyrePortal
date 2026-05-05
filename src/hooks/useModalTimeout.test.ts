import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useModalTimeout } from './useModalTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});

describe('useModalTimeout', () => {
  it('starts timer when isActive is true', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useModalTimeout({ duration: 5000, isActive: true, onTimeout })
    );
    expect(result.current.isRunning).toBe(true);
    expect(result.current.animationKey).toBeGreaterThan(0);
  });

  it('does not start when isActive is false', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useModalTimeout({ duration: 5000, isActive: false, onTimeout })
    );
    expect(result.current.isRunning).toBe(false);
  });

  it('calls onTimeout after duration', () => {
    const onTimeout = vi.fn();
    renderHook(() => useModalTimeout({ duration: 3000, isActive: true, onTimeout }));

    act(() => vi.advanceTimersByTime(3000));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('does not call onTimeout before duration', () => {
    const onTimeout = vi.fn();
    renderHook(() => useModalTimeout({ duration: 5000, isActive: true, onTimeout }));

    act(() => vi.advanceTimersByTime(4999));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stops timer when isActive becomes false', () => {
    const onTimeout = vi.fn();
    const { rerender, result } = renderHook(
      ({ isActive }) => useModalTimeout({ duration: 5000, isActive, onTimeout }),
      { initialProps: { isActive: true } }
    );

    rerender({ isActive: false });
    expect(result.current.isRunning).toBe(false);

    act(() => vi.advanceTimersByTime(10000));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('resets timer on manual reset()', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useModalTimeout({ duration: 5000, isActive: true, onTimeout })
    );

    act(() => vi.advanceTimersByTime(3000));
    const keyBefore = result.current.animationKey;

    act(() => result.current.reset());
    expect(result.current.animationKey).toBeGreaterThan(keyBefore);

    // Original timeout should NOT fire (was reset)
    act(() => vi.advanceTimersByTime(3000));
    expect(onTimeout).not.toHaveBeenCalled();

    // But new timeout fires at full duration from reset
    act(() => vi.advanceTimersByTime(2000));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('resets timer when resetKey changes', () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook(
      ({ resetKey }) => useModalTimeout({ duration: 5000, isActive: true, onTimeout, resetKey }),
      { initialProps: { resetKey: 'key-1' } }
    );

    act(() => vi.advanceTimersByTime(3000));
    rerender({ resetKey: 'key-2' }); // New scan

    // Old timeout should not fire
    act(() => vi.advanceTimersByTime(3000));
    expect(onTimeout).not.toHaveBeenCalled();

    // New timeout fires at full duration
    act(() => vi.advanceTimersByTime(2000));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('cleans up timeout on unmount', () => {
    const onTimeout = vi.fn();
    const { unmount } = renderHook(() =>
      useModalTimeout({ duration: 5000, isActive: true, onTimeout })
    );

    unmount();
    act(() => vi.advanceTimersByTime(10000));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
