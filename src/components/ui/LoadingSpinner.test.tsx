import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSpinner, SpinKeyframes } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders without crashing', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies default minHeight', () => {
    const { container } = render(<LoadingSpinner />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.minHeight).toBe('400px');
  });

  it('applies custom minHeight', () => {
    const { container } = render(<LoadingSpinner minHeight="200px" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.minHeight).toBe('200px');
  });

  it('renders the inner spinner element', () => {
    const { container } = render(<LoadingSpinner />);
    const wrapper = container.firstChild as HTMLElement;
    const spinner = wrapper.firstChild as HTMLElement;
    expect(spinner).toBeInTheDocument();
    expect(spinner.tagName).toBe('DIV');
  });
});

describe('SpinKeyframes', () => {
  it('renders a style element with spin keyframes', () => {
    const { container } = render(<SpinKeyframes />);
    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.textContent).toContain('@keyframes spin');
  });
});
