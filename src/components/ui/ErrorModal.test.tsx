import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorModal } from './ErrorModal';

describe('ErrorModal', () => {
  it('renders the error message when open', () => {
    render(<ErrorModal isOpen={true} onClose={vi.fn()} message="Etwas ist schiefgelaufen" />);
    expect(screen.getByText('Fehler')).toBeInTheDocument();
    expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
  });

  it('renders a dialog element', () => {
    const { container } = render(<ErrorModal isOpen={false} onClose={vi.fn()} message="Test" />);
    expect(container.querySelector('dialog')).toBeInTheDocument();
  });

  it('displays a custom message', () => {
    render(<ErrorModal isOpen={true} onClose={vi.fn()} message="PIN ungültig" />);
    expect(screen.getByText('PIN ungültig')).toBeInTheDocument();
  });

  it('always shows the heading Fehler', () => {
    render(<ErrorModal isOpen={true} onClose={vi.fn()} message="any error" />);
    expect(screen.getByRole('heading', { name: 'Fehler' })).toBeInTheDocument();
  });
});
