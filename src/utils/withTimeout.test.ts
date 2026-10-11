import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeoutError, withTimeout } from './withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with a TimeoutError carrying the message when the deadline passes', async () => {
    const pending = withTimeout(new Promise<never>(() => undefined), 100, 'Zu langsam');
    const assertion = expect(pending).rejects.toSatisfy(
      (error: unknown) => error instanceof TimeoutError && error.message === 'Zu langsam'
    );
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('passes the rejection of the promise through and never as a TimeoutError', async () => {
    const failure = new Error('Zu langsam');
    const pending = withTimeout(Promise.reject(failure), 100, 'Zu langsam');
    await expect(pending).rejects.toBe(failure);
    await expect(pending).rejects.not.toBeInstanceOf(TimeoutError);
  });

  it('resolves with the value of the promise before the deadline', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'Zu langsam')).resolves.toBe(42);
  });
});
