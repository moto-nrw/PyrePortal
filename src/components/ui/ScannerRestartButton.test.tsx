import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { isRfidEnabled, safeInvoke } from '../../utils/tauriContext';

import { ScannerRestartButton } from './ScannerRestartButton';

const mockIsRfidEnabled = vi.mocked(isRfidEnabled);
const mockSafeInvoke = vi.mocked(safeInvoke);

beforeEach(() => {
  mockIsRfidEnabled.mockReturnValue(false);
  mockSafeInvoke.mockResolvedValue(undefined);
});

describe('ScannerRestartButton', () => {
  it('renders the restart button with default text', () => {
    render(<ScannerRestartButton />);
    expect(screen.getByText('Lesegerät neu starten')).toBeInTheDocument();
  });

  it('renders a button element', () => {
    render(<ScannerRestartButton />);
    expect(screen.getByLabelText('Lesegerät neu starten')).toBeInTheDocument();
  });

  it('calls onBeforeRecover and onAfterRecover on click', async () => {
    const onBefore = vi.fn().mockResolvedValue(undefined);
    const onAfter = vi.fn().mockResolvedValue(undefined);
    render(<ScannerRestartButton onBeforeRecover={onBefore} onAfterRecover={onAfter} />);

    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    await waitFor(() => {
      expect(onBefore).toHaveBeenCalledOnce();
      expect(onAfter).toHaveBeenCalledOnce();
    });
  });

  it('shows success modal after successful recovery', async () => {
    render(<ScannerRestartButton />);
    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    await waitFor(() => {
      expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
    });
  });

  it('shows error modal when recovery fails', async () => {
    const onBefore = vi.fn().mockRejectedValue(new Error('fail'));
    render(<ScannerRestartButton onBeforeRecover={onBefore} />);

    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    await waitFor(() => {
      expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
    });
  });

  it('shows "Starte neu..." text while recovering', async () => {
    let resolveRecover: () => void;
    const onBefore = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveRecover = resolve;
        })
    );

    render(<ScannerRestartButton onBeforeRecover={onBefore} />);
    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    expect(screen.getByText('Starte neu...')).toBeInTheDocument();

    resolveRecover!();
    await waitFor(() => {
      expect(screen.getByText('Lesegerät neu starten')).toBeInTheDocument();
    });
  });
});
