import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptySlot } from './EmptySlot';

describe('EmptySlot', () => {
  it('renders "Leer" text', () => {
    render(<EmptySlot icon="person" index={0} />);
    expect(screen.getByText('Leer')).toBeInTheDocument();
  });

  it('renders an SVG icon', () => {
    const { container } = render(<EmptySlot icon="person" index={0} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with dashed border style', () => {
    const { container } = render(<EmptySlot icon="door" index={0} />);
    const slot = container.firstChild as HTMLElement;
    expect(slot.style.border).toContain('dashed');
  });

  it('renders with different icon types without crashing', () => {
    const { container: c1 } = render(<EmptySlot icon="person" index={0} />);
    expect(c1.querySelector('svg')).toBeInTheDocument();

    const { container: c2 } = render(<EmptySlot icon="calendar" index={1} />);
    expect(c2.querySelector('svg')).toBeInTheDocument();

    const { container: c3 } = render(<EmptySlot icon="door" index={2} />);
    expect(c3.querySelector('svg')).toBeInTheDocument();
  });
});
