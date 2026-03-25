import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PaginationControls } from './PaginationControls';

const defaultProps = {
  currentPage: 0,
  totalPages: 3,
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
};

describe('PaginationControls', () => {
  it('renders page indicator text', () => {
    render(<PaginationControls {...defaultProps} />);
    expect(screen.getByText('Seite 1 von 3')).toBeInTheDocument();
  });

  it('renders prev and next buttons', () => {
    render(<PaginationControls {...defaultProps} />);
    expect(screen.getByText('Vorherige')).toBeInTheDocument();
    expect(screen.getByText('Nächste')).toBeInTheDocument();
  });

  it('returns null when totalPages is 1', () => {
    const { container } = render(<PaginationControls {...defaultProps} totalPages={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('disables prev button on first page by default', () => {
    render(<PaginationControls {...defaultProps} currentPage={0} />);
    expect(screen.getByText('Vorherige').closest('button')).toBeDisabled();
  });

  it('disables next button on last page by default', () => {
    render(<PaginationControls {...defaultProps} currentPage={2} totalPages={3} />);
    expect(screen.getByText('Nächste').closest('button')).toBeDisabled();
  });

  it('calls onNextPage when next button clicked', async () => {
    const onNextPage = vi.fn();
    render(<PaginationControls {...defaultProps} currentPage={0} onNextPage={onNextPage} />);
    await userEvent.click(screen.getByText('Nächste'));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it('respects explicit canGoPrev and canGoNext props', () => {
    render(
      <PaginationControls {...defaultProps} currentPage={0} canGoPrev={true} canGoNext={false} />
    );
    expect(screen.getByText('Vorherige').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Nächste').closest('button')).toBeDisabled();
  });
});
