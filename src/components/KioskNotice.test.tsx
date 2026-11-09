import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from '../store/userStore';

import { KIOSK_NOTICE_TIMEOUT_MS, KioskNotice } from './KioskNotice';

const notice = { title: 'Aufsicht beendet', message: 'Die Aufsicht an diesem Gerät ist beendet.' };

describe('KioskNotice', () => {
  beforeEach(() => {
    useUserStore.setState({ kioskNotice: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing without a notice', () => {
    render(<KioskNotice />);
    expect(screen.queryByText(notice.title)).not.toBeInTheDocument();
  });

  it('shows the notice of the store and closes on tap', () => {
    useUserStore.setState({ kioskNotice: notice });
    render(<KioskNotice />);

    expect(screen.getByText(notice.title)).toBeInTheDocument();
    expect(screen.getByText(notice.message)).toBeInTheDocument();

    fireEvent.click(screen.getByText(notice.message));
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it('closes by itself after a while', () => {
    vi.useFakeTimers();
    useUserStore.setState({ kioskNotice: notice });
    render(<KioskNotice />);

    act(() => {
      vi.advanceTimersByTime(KIOSK_NOTICE_TIMEOUT_MS + 100);
    });
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });
});
