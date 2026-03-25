import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BackButton from './BackButton';

describe('BackButton', () => {
  it('renders with default text "Zurück"', () => {
    render(<BackButton onClick={vi.fn()} />);
    expect(screen.getByText('Zurück')).toBeInTheDocument();
  });

  it('renders custom text', () => {
    render(<BackButton onClick={vi.fn()} text="Abbrechen" />);
    expect(screen.getByText('Abbrechen')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<BackButton onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<BackButton onClick={handleClick} disabled />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders an SVG icon', () => {
    const { container } = render(<BackButton onClick={vi.fn()} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses aria-label from text prop by default', () => {
    render(<BackButton onClick={vi.fn()} text="Zurück" />);
    expect(screen.getByLabelText('Zurück')).toBeInTheDocument();
  });

  it('uses custom ariaLabel when provided', () => {
    render(<BackButton onClick={vi.fn()} ariaLabel="Go back" />);
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });
});
