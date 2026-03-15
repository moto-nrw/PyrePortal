import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModalTimeoutIndicator } from './ModalTimeoutIndicator';

describe('ModalTimeoutIndicator', () => {
  it('renders without crashing', () => {
    const { container } = render(<ModalTimeoutIndicator duration={3000} isActive={false} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with default bottom position', () => {
    const { container } = render(<ModalTimeoutIndicator duration={3000} isActive={false} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.bottom).toBe('0px');
  });

  it('renders with top position when specified', () => {
    const { container } = render(
      <ModalTimeoutIndicator duration={3000} isActive={false} position="top" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.top).toBe('0px');
  });

  it('applies custom height', () => {
    const { container } = render(
      <ModalTimeoutIndicator duration={3000} isActive={false} height={10} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.height).toBe('10px');
  });

  it('renders both container and bar elements', () => {
    const { container } = render(<ModalTimeoutIndicator duration={3000} isActive={false} />);
    const wrapper = container.firstChild as HTMLElement;
    const bar = wrapper.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(bar).toBeInTheDocument();
    expect(wrapper.style.position).toBe('absolute');
  });

  it('applies custom colors', () => {
    const { container } = render(
      <ModalTimeoutIndicator duration={3000} isActive={false} color="red" trackColor="blue" />
    );
    const wrapper = container.firstChild as HTMLElement;
    const bar = wrapper.firstChild as HTMLElement;
    expect(wrapper.style.backgroundColor).toBe('blue');
    expect(bar.style.backgroundColor).toBe('red');
  });
});
