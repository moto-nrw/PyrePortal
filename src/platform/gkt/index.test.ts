import { describe, expect, it } from 'vitest';

import { normalizeNfcPayload } from './index';

describe('normalizeNfcPayload', () => {
  // Intent-path payload: {uid, eventSource, eventNumber}
  it('extracts uid from intent-path payload', () => {
    const payload = { uid: 'f0:bc:e8:44', eventSource: 'NFC', eventNumber: 3 };
    expect(normalizeNfcPayload(payload)).toBe('F0:BC:E8:44');
  });

  // Sensor-path payload: {eventSource, barcode}
  it('extracts barcode from sensor-path payload', () => {
    const payload = { eventSource: 'nfc', barcode: 'f0:bc:e8:44' };
    expect(normalizeNfcPayload(payload)).toBe('F0:BC:E8:44');
  });

  // Legacy string payload
  it('handles legacy string payload', () => {
    expect(normalizeNfcPayload('f0:bc:e8:44')).toBe('F0:BC:E8:44');
  });

  // uid takes precedence over barcode
  it('prefers uid over barcode when both present', () => {
    const payload = { uid: 'aa:bb:cc:dd', barcode: '11:22:33:44', eventSource: 'NFC' };
    expect(normalizeNfcPayload(payload)).toBe('AA:BB:CC:DD');
  });

  // Already uppercase
  it('handles already uppercase UIDs', () => {
    const payload = { uid: 'F0:BC:E8:44', eventSource: 'NFC', eventNumber: 1 };
    expect(normalizeNfcPayload(payload)).toBe('F0:BC:E8:44');
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
