import { describe, expect, it } from 'vitest';

describe('Test infrastructure', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('has access to happy-dom environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });

  it('has localStorage mock available', () => {
    localStorage.setItem('test', 'value');
    expect(localStorage.getItem('test')).toBe('value');
  });

  it('has __APP_VERSION__ defined', () => {
    expect(__APP_VERSION__).toBeDefined();
    expect(typeof __APP_VERSION__).toBe('string');
  });
});
