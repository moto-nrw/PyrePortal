import { describe, expect, it } from 'vitest';

import { getSecureRandomInt } from './crypto';

describe('getSecureRandomInt', () => {
  it('returns value in range [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const value = getSecureRandomInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it('returns 0 for maxExclusive=1', () => {
    for (let i = 0; i < 20; i++) {
      expect(getSecureRandomInt(1)).toBe(0);
    }
  });

  it('handles large ranges', () => {
    const value = getSecureRandomInt(1000000);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1000000);
  });

  it('throws for zero', () => {
    expect(() => getSecureRandomInt(0)).toThrow('must be a positive integer');
  });

  it('throws for negative', () => {
    expect(() => getSecureRandomInt(-5)).toThrow('must be a positive integer');
  });

  it('throws for non-integer', () => {
    expect(() => getSecureRandomInt(3.5)).toThrow('must be a positive integer');
  });

  it('produces varied output (not always same value)', () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(getSecureRandomInt(100));
    }
    // With 50 draws from [0,100), should have multiple unique values
    expect(values.size).toBeGreaterThan(5);
  });
});
