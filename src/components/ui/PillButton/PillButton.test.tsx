import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PillButton } from './PillButton';

describe('PillButton', () => {
  it('renders children text', () => {
    render(
      <PillButton variant="primary" onClick={vi.fn()}>
        Weiter
      </PillButton>
    );
    expect(screen.getByText('Weiter')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(
      <PillButton variant="primary" onClick={handleClick}>
        Click
      </PillButton>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(
      <PillButton variant="primary" onClick={handleClick} disabled>
        Click
      </PillButton>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders with aria-label', () => {
    render(
      <PillButton variant="secondary" onClick={vi.fn()} ariaLabel="Go back">
        Zurück
      </PillButton>
    );
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });

  it('renders icon on the left by default', () => {
    const icon = <span data-testid="icon">I</span>;
    render(
      <PillButton variant="secondary" onClick={vi.fn()} icon={icon}>
        Text
      </PillButton>
    );
    const button = screen.getByRole('button');
    const iconEl = screen.getByTestId('icon');
    const textEl = screen.getByText('Text');
    const children = Array.from(button.childNodes);
    expect(children.indexOf(iconEl)).toBeLessThan(children.indexOf(textEl));
  });

  it('renders icon on the right when iconPosition is right', () => {
    const icon = <span data-testid="icon">I</span>;
    render(
      <PillButton variant="secondary" onClick={vi.fn()} icon={icon} iconPosition="right">
        Text
      </PillButton>
    );
    const button = screen.getByRole('button');
    const iconEl = screen.getByTestId('icon');
    const textEl = screen.getByText('Text');
    const children = Array.from(button.childNodes);
    expect(children.indexOf(iconEl)).toBeGreaterThan(children.indexOf(textEl));
  });

  it('applies disabled styling with reduced opacity', () => {
    render(
      <PillButton variant="primary" onClick={vi.fn()} disabled>
        Disabled
      </PillButton>
    );
    const button = screen.getByRole('button');
    expect(button.style.opacity).toBe('0.6');
  });
});
