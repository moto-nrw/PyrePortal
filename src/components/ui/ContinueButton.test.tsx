import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContinueButton } from './ContinueButton';

describe('ContinueButton', () => {
  it('renders with default text "Weiter"', () => {
    render(<ContinueButton onClick={vi.fn()} />);
    expect(screen.getByText('Weiter')).toBeInTheDocument();
  });

  it('renders custom children text', () => {
    render(<ContinueButton onClick={vi.fn()}>Speichern</ContinueButton>);
    expect(screen.getByText('Speichern')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<ContinueButton onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<ContinueButton onClick={handleClick} disabled />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders as a button element', () => {
    render(<ContinueButton onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
