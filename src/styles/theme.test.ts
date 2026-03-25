import { describe, expect, it } from 'vitest';

import theme from './theme';

describe('theme', () => {
  it('has primary color', () => {
    expect(theme.colors.primary).toBe('#24c8db');
  });

  it('has font sizes', () => {
    expect(theme.fonts.size.base).toBe('1em');
    expect(theme.fonts.size.small).toBeDefined();
  });

  it('has spacing scale', () => {
    expect(theme.spacing.md).toBe('1rem');
    expect(theme.spacing.xl).toBe('2rem');
  });

  it('has animation transitions', () => {
    expect(theme.animation.transition.fast).toBe('all 0.2s');
  });

  it('has shadow values', () => {
    expect(theme.shadows.sm).toBeDefined();
    expect(theme.shadows.lg).toBeDefined();
  });
});
