import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectableCard } from './SelectableCard';

const defaultProps = {
  name: 'Test Card',
  icon: 'person' as const,
  colorType: 'staff' as const,
  isSelected: false,
  onClick: vi.fn(),
};

describe('SelectableCard', () => {
  it('renders the name', () => {
    render(<SelectableCard {...defaultProps} />);
    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<SelectableCard {...defaultProps} onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<SelectableCard {...defaultProps} onClick={handleClick} isDisabled />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders a badge when provided', () => {
    render(<SelectableCard {...defaultProps} badge="3a" />);
    expect(screen.getByText('3a')).toBeInTheDocument();
  });

  it('does not render a badge when not provided', () => {
    const { container } = render(<SelectableCard {...defaultProps} />);
    const spans = container.querySelectorAll('span');
    const badgeSpans = Array.from(spans).filter(s => s.textContent !== 'Test Card');
    expect(badgeSpans).toHaveLength(0);
  });

  it('renders an SVG icon', () => {
    const { container } = render(<SelectableCard {...defaultProps} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows selection checkmark when selected', () => {
    const { container } = render(<SelectableCard {...defaultProps} isSelected />);
    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThan(0);
  });
});
