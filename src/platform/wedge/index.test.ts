import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { NfcScanEvent } from '../adapter';

import { adapter, normalizeWedgeUid } from './index';

// ---------------------------------------------------------------------------
// normalizeWedgeUid (pure function)
// ---------------------------------------------------------------------------

describe('normalizeWedgeUid', () => {
  it('formats plain hex into uppercase colon-separated pairs', () => {
    expect(normalizeWedgeUid('04d69482976a80')).toBe('04:D6:94:82:97:6A:80');
  });

  it('accepts already colon-separated input', () => {
    expect(normalizeWedgeUid('f0:bc:e8:44')).toBe('F0:BC:E8:44');
  });

  it('accepts space- and dash-separated input', () => {
    expect(normalizeWedgeUid('F0 BC E8 44')).toBe('F0:BC:E8:44');
    expect(normalizeWedgeUid('F0-BC-E8-44')).toBe('F0:BC:E8:44');
  });

  it('rejects non-hex input', () => {
    expect(normalizeWedgeUid('hello world!')).toBeNull();
  });

  it('rejects too-short input', () => {
    expect(normalizeWedgeUid('F0BC')).toBeNull();
  });

  it('rejects odd-length hex', () => {
    expect(normalizeWedgeUid('F0BCE844A')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(normalizeWedgeUid('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WedgeAdapter keyboard capture
// ---------------------------------------------------------------------------

/** Simulate a wedge reader typing a string followed by Enter. */
function typeScan(text: string): void {
  for (const char of text) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('WedgeAdapter', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await adapter.initializeNfc();
  });

  afterEach(async () => {
    await adapter.stopScanning();
    vi.useRealTimers();
  });

  it('emits a normalized scan event when the reader types a UID + Enter', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    typeScan('04d69482976a80');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0]).toMatchObject({ tagId: '04:D6:94:82:97:6A:80' });
  });

  it('assigns increasing scanIds to consecutive scans', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    typeScan('f0bce844');
    typeScan('f0bce844');

    expect(onScan).toHaveBeenCalledTimes(2);
    const [first, second] = onScan.mock.calls.map(call => (call[0] as NfcScanEvent).scanId);
    expect(second).toBeGreaterThan(first);
  });

  it('ignores Enter when the buffer is not a plausible UID', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    typeScan('xyz');

    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores modifier keys interleaved with the UID', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    typeScan('F0BCE844');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0]).toMatchObject({ tagId: 'F0:BC:E8:44' });
  });

  it('does not emit after stopScanning', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);
    await adapter.stopScanning();

    typeScan('f0bce844');

    expect(onScan).not.toHaveBeenCalled();
  });

  it('swallows valid scanner Enter events even when scanning is stopped', async () => {
    await adapter.stopScanning();

    for (const char of 'f0bce844') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(enterEvent, 'stopPropagation');

    document.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('swallows separator keystrokes mid-burst so they cannot activate focused controls', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    for (const char of 'F0') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(spaceEvent, 'stopPropagation');
    document.dispatchEvent(spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(stopPropagationSpy).toHaveBeenCalled();

    // The rest of the burst still resolves to a normalized scan
    typeScan('BC E8 44');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0]).toMatchObject({ tagId: 'F0:BC:E8:44' });
  });

  it('does not swallow a space when the buffer is empty', async () => {
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(false);

    // Clear buffer residue so it cannot leak into the next test
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  it('does not swallow a space typed after a slow human-typing gap', async () => {
    const nowSpy = vi.spyOn(performance, 'now');

    nowSpy.mockReturnValue(0);
    for (const char of 'F0') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    // 500 ms later the buffer has been reset — human typing, not a burst
    nowSpy.mockReturnValue(500);
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(false);

    nowSpy.mockRestore();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  it('does not swallow a space when the buffer is not a plausible UID prefix', async () => {
    for (const char of 'zz') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  it('scanSingleTag resolves with the next scanned tag and restores the previous callback', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    const singleScan = adapter.scanSingleTag(5000);
    typeScan('f0bce844');

    await expect(singleScan).resolves.toEqual({ success: true, tag_id: 'F0:BC:E8:44' });
    expect(onScan).not.toHaveBeenCalled();

    // Previous callback is restored after the one-shot resolves
    typeScan('04d69482976a80');
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('scanSingleTag times out when nothing is scanned', async () => {
    const singleScan = adapter.scanSingleTag(1000);
    vi.advanceTimersByTime(1001);

    await expect(singleScan).resolves.toEqual({ success: false, error: 'Scan timed out' });
  });

  it('scanSingleTag cancels a pending one-shot before starting another one', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);

    const firstScan = adapter.scanSingleTag(5000);
    const secondScan = adapter.scanSingleTag(5000);

    await expect(firstScan).resolves.toEqual({ success: false, error: 'Scan canceled' });

    typeScan('f0bce844');
    await expect(secondScan).resolves.toEqual({ success: true, tag_id: 'F0:BC:E8:44' });

    typeScan('04d69482976a80');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0]).toMatchObject({ tagId: '04:D6:94:82:97:6A:80' });
  });

  it('stopScanning settles a pending one-shot as cancelled', async () => {
    const singleScan = adapter.scanSingleTag(5000);

    await adapter.stopScanning();

    await expect(singleScan).resolves.toEqual({ success: false, error: 'Scan canceled' });
  });

  it('resets the buffer after a slow human-typing gap', async () => {
    const onScan = vi.fn();
    await adapter.startScanning(onScan);
    const nowSpy = vi.spyOn(performance, 'now');

    // First half typed at t=0
    nowSpy.mockReturnValue(0);
    for (const char of 'f0bc') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    // Full UID arrives 500 ms later — the stale "f0bc" prefix must be discarded,
    // otherwise the merged buffer would yield "F0:BC:F0:BC:E8:44"
    nowSpy.mockReturnValue(500);
    typeScan('f0bce844');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan.mock.calls[0][0]).toMatchObject({ tagId: 'F0:BC:E8:44' });
  });

  it('initializeNfc attaches the keydown listener only once', async () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');

    await adapter.initializeNfc();
    await adapter.initializeNfc();

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });

  it('persistLog writes to console', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await adapter.persistLog('test entry');

    expect(consoleSpy).toHaveBeenCalledWith('[PyrePortal]', 'test entry');
    consoleSpy.mockRestore();
  });

  it('getDeviceInfo returns wedge platform with version', () => {
    const info = adapter.getDeviceInfo();

    expect(info.platform).toBe('wedge');
    expect(typeof info.version).toBe('string');
  });
});
