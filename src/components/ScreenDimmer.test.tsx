import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as idleTimerModule from '../hooks/useIdleTimer';

import ScreenDimmer from './ScreenDimmer';

vi.mock('../hooks/useIdleTimer', () => ({
  useIdleTimer: vi.fn(() => ({ isDimmed: false, resetIdle: vi.fn() })),
}));

const mockUseIdleTimer = vi.mocked(idleTimerModule.useIdleTimer);

describe('ScreenDimmer', () => {
  it('renders a fixed overlay div', () => {
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.style.position).toBe('fixed');
    expect(div.style.zIndex).toBe('9999');
    expect(div.getAttribute('aria-hidden')).toBe('true');
  });

  it('is transparent and non-interactive when not dimmed', () => {
    mockUseIdleTimer.mockReturnValue({ isDimmed: false, resetIdle: vi.fn() });
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.opacity).toBe('0');
    expect(div.style.pointerEvents).toBe('none');
  });

  it('is visible and interactive when dimmed', () => {
    mockUseIdleTimer.mockReturnValue({ isDimmed: true, resetIdle: vi.fn() });
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.opacity).toBe('1');
    expect(div.style.pointerEvents).toBe('auto');
  });

  it('uses slow fade-in transition when dimming', () => {
    mockUseIdleTimer.mockReturnValue({ isDimmed: true, resetIdle: vi.fn() });
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.transition).toContain('0.6s');
    expect(div.style.transition).toContain('ease-in');
  });

  it('uses fast fade-out transition when waking', () => {
    mockUseIdleTimer.mockReturnValue({ isDimmed: false, resetIdle: vi.fn() });
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.transition).toContain('0.15s');
    expect(div.style.transition).toContain('ease-out');
  });

  it('has dark background color', () => {
    const { container } = render(<ScreenDimmer />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.backgroundColor).toBe('rgba(0, 0, 0, 0.75)');
  });
});
