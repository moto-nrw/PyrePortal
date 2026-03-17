import { describe, expect, it } from 'vitest';

import { normalizeNfcPayload } from './index';

describe('normalizeNfcPayload', () => {
  // Intent-path payload: {uid, eventSource, eventNumber}
  it('extracts uid and eventNumber from intent-path payload', () => {
    const payload = { uid: 'f0:bc:e8:44', eventSource: 'NFC', eventNumber: 3 };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: 3 });
  });

  // Sensor-path payload: {eventSource, barcode}
  it('extracts barcode with null eventNumber from sensor-path payload', () => {
    const payload = { eventSource: 'nfc', barcode: 'f0:bc:e8:44' };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: null });
  });

  // Legacy string payload
  it('handles legacy string payload with null eventNumber', () => {
    expect(normalizeNfcPayload('f0:bc:e8:44')).toEqual({
      tagId: 'F0:BC:E8:44',
      eventNumber: null,
    });
  });

  // uid takes precedence over barcode
  it('prefers uid over barcode when both present', () => {
    const payload = { uid: 'aa:bb:cc:dd', barcode: '11:22:33:44', eventSource: 'NFC' };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'AA:BB:CC:DD', eventNumber: null });
  });

  // Already uppercase
  it('handles already uppercase UIDs', () => {
    const payload = { uid: 'F0:BC:E8:44', eventSource: 'NFC', eventNumber: 1 };
    expect(normalizeNfcPayload(payload)).toEqual({ tagId: 'F0:BC:E8:44', eventNumber: 1 });
  });

  // Edge cases
  it('returns null for null input', () => {
    expect(normalizeNfcPayload(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeNfcPayload(undefined)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(normalizeNfcPayload({})).toBeNull();
  });

  it('returns null for object with empty uid', () => {
    expect(normalizeNfcPayload({ uid: '', eventSource: 'NFC' })).toBeNull();
  });

  it('returns null for number input', () => {
    expect(normalizeNfcPayload(42)).toBeNull();
  });
});
