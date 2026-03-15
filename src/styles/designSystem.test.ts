import { describe, expect, it } from 'vitest';

import { designSystem } from './designSystem';

describe('designSystem', () => {
  it('has border radius values', () => {
    expect(designSystem.borderRadius.sm).toBe('8px');
    expect(designSystem.borderRadius.full).toBe('9999px');
  });

  it('has shadow values', () => {
    expect(designSystem.shadows.soft).toBeDefined();
    expect(designSystem.shadows.modal).toBeDefined();
    expect(typeof designSystem.shadows.soft).toBe('string');
  });

  it('has glass effects', () => {
    expect(designSystem.glass.background).toBeDefined();
    expect(designSystem.glass.blur).toBe('blur(20px)');
  });
});
