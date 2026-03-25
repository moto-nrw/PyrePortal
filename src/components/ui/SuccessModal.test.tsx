import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SuccessModal } from './SuccessModal';

describe('SuccessModal', () => {
  it('renders the success message when open', () => {
    render(<SuccessModal isOpen={true} onClose={vi.fn()} message="Aktion erfolgreich" />);
    expect(screen.getByText('Erfolgreich!')).toBeInTheDocument();
    expect(screen.getByText('Aktion erfolgreich')).toBeInTheDocument();
  });

  it('renders a dialog element', () => {
    const { container } = render(<SuccessModal isOpen={false} onClose={vi.fn()} message="Test" />);
    expect(container.querySelector('dialog')).toBeInTheDocument();
  });

  it('displays a custom message', () => {
    render(<SuccessModal isOpen={true} onClose={vi.fn()} message="Gespeichert" />);
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
  });

  it('shows the Erfolgreich heading', () => {
    render(<SuccessModal isOpen={true} onClose={vi.fn()} message="ok" />);
    expect(screen.getByRole('heading', { name: 'Erfolgreich!' })).toBeInTheDocument();
  });

  it('renders the checkmark SVG', () => {
    const { container } = render(<SuccessModal isOpen={true} onClose={vi.fn()} message="ok" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
