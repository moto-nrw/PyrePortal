import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { isRfidEnabled } from '../../utils/tauriContext';

import { ScannerRestartButton } from './ScannerRestartButton';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    platform: 'tauri',
    recoverScanner: vi.fn(),
    getScannerStatus: vi.fn(),
    getServiceStatus: vi.fn(),
  },
}));

const { adapter } = await import('@platform');
const mockRecoverScanner = vi.mocked(adapter.recoverScanner);
const mockGetScannerStatus = vi.mocked(adapter.getScannerStatus);
const mockGetServiceStatus = vi.mocked(adapter.getServiceStatus);

const mockIsRfidEnabled = vi.mocked(isRfidEnabled);

beforeEach(() => {
  (adapter as unknown as Record<string, unknown>).platform = 'tauri';
  mockIsRfidEnabled.mockReturnValue(false);
  mockRecoverScanner.mockResolvedValue(undefined);
  mockGetScannerStatus.mockResolvedValue({ is_available: true });
  mockGetServiceStatus.mockResolvedValue({ is_running: true });
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

  it('disables button during recovery (concurrent click guard)', async () => {
    let resolveRecover: () => void;
    const onBefore = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveRecover = resolve;
        })
    );

    render(<ScannerRestartButton onBeforeRecover={onBefore} />);
    const button = screen.getByLabelText('Lesegerät neu starten');

    await userEvent.click(button);
    expect(button).toBeDisabled();

    resolveRecover!();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('completes recovery without callbacks provided', async () => {
    render(<ScannerRestartButton />);
    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    await waitFor(() => {
      expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
    });
  });

  it('does not call onAfterRecover when onBeforeRecover throws', async () => {
    const onBefore = vi.fn().mockRejectedValue(new Error('before failed'));
    const onAfter = vi.fn().mockResolvedValue(undefined);
    render(<ScannerRestartButton onBeforeRecover={onBefore} onAfterRecover={onAfter} />);

    await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

    await waitFor(() => {
      expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
    });
    expect(onAfter).not.toHaveBeenCalled();
  });

  describe('RFID enabled path', () => {
    beforeEach(() => {
      mockIsRfidEnabled.mockReturnValue(true);
    });

    it('calls adapter.recoverScanner and adapter.getScannerStatus on success', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({ is_available: true });
      mockGetServiceStatus.mockResolvedValue({ is_running: true });

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
      });

      expect(mockRecoverScanner).toHaveBeenCalled();
      expect(mockGetScannerStatus).toHaveBeenCalled();
      expect(mockGetServiceStatus).toHaveBeenCalled();
    });

    it('throws last_error when scanner is not available after recovery', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({
        is_available: false,
        last_error: 'Hardware defekt',
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('uses fallback error when scanner not available and no last_error', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({ is_available: false });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('throws when service is not running after recovery', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({ is_available: true });
      mockGetServiceStatus.mockResolvedValue({ is_running: false });

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('shows error on recovery timeout after 8000ms', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      // Never resolves - will timeout
      mockRecoverScanner.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ScannerRestartButton />);
      await user.click(screen.getByLabelText('Lesegerät neu starten'));

      // Advance past the 8000ms timeout
      vi.advanceTimersByTime(8100);

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });

      vi.useRealTimers();
    });

    it('skips adapter calls but runs callbacks when RFID disabled', async () => {
      mockIsRfidEnabled.mockReturnValue(false);

      const onBefore = vi.fn().mockResolvedValue(undefined);
      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onBeforeRecover={onBefore} onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
      });

      expect(onBefore).toHaveBeenCalledOnce();
      expect(onAfter).toHaveBeenCalledOnce();
      expect(mockRecoverScanner).not.toHaveBeenCalled();
    });

    it('handles status returning null/undefined gracefully', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue(null as never);

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('handles recoverScanner rejection', async () => {
      mockRecoverScanner.mockRejectedValue(new Error('hardware failure'));

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('handles non-Error rejection from withTimeout', async () => {
      mockRecoverScanner.mockRejectedValue('string error');

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('checks getServiceStatus only when onAfterRecover is provided', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({ is_available: true });
      mockGetServiceStatus.mockResolvedValue({ is_running: true });

      // Without onAfterRecover - should NOT call getServiceStatus
      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
      });

      expect(mockGetServiceStatus).not.toHaveBeenCalled();
    });

    it('handles serviceStatus returning null after recovery', async () => {
      mockRecoverScanner.mockResolvedValue(undefined);
      mockGetScannerStatus.mockResolvedValue({ is_available: true });
      mockGetServiceStatus.mockResolvedValue(null as never);

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });
  });
});
