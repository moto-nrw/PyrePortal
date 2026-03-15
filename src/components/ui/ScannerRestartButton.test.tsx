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

    it('calls recover_rfid_scanner and get_rfid_scanner_status on success', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status')
          return Promise.resolve({ is_available: true, last_error: undefined });
        if (cmd === 'get_rfid_service_status') return Promise.resolve({ is_running: true });
        return Promise.resolve(undefined);
      });

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
      });

      expect(mockSafeInvoke).toHaveBeenCalledWith('recover_rfid_scanner');
      expect(mockSafeInvoke).toHaveBeenCalledWith('get_rfid_scanner_status');
      expect(mockSafeInvoke).toHaveBeenCalledWith('get_rfid_service_status');
    });

    it('throws last_error when scanner is not available after recovery', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status')
          return Promise.resolve({ is_available: false, last_error: 'Hardware defekt' });
        return Promise.resolve(undefined);
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('uses fallback error when scanner not available and no last_error', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status') return Promise.resolve({ is_available: false });
        return Promise.resolve(undefined);
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('throws when service is not running after recovery', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status') return Promise.resolve({ is_available: true });
        if (cmd === 'get_rfid_service_status') return Promise.resolve({ is_running: false });
        return Promise.resolve(undefined);
      });

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('shows error on recovery timeout after 8000ms', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') {
          // Never resolves - will timeout
          return new Promise(() => {});
        }
        return Promise.resolve(undefined);
      });

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

    it('skips Tauri calls but runs callbacks when RFID disabled', async () => {
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
      expect(mockSafeInvoke).not.toHaveBeenCalled();
    });

    it('handles status returning null/undefined gracefully', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status') return Promise.resolve(null);
        return Promise.resolve(undefined);
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('handles recover_rfid_scanner rejection', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.reject(new Error('hardware failure'));
        return Promise.resolve(undefined);
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('handles non-Error rejection from withTimeout', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject('string error');
        }
        return Promise.resolve(undefined);
      });

      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });

    it('checks get_rfid_service_status only when onAfterRecover is provided', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status') return Promise.resolve({ is_available: true });
        if (cmd === 'get_rfid_service_status') return Promise.resolve({ is_running: true });
        return Promise.resolve(undefined);
      });

      // Without onAfterRecover - should NOT call get_rfid_service_status
      render(<ScannerRestartButton />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText('Lesegerät wurde neu gestartet.')).toBeInTheDocument();
      });

      expect(mockSafeInvoke).not.toHaveBeenCalledWith('get_rfid_service_status');
    });

    it('handles serviceStatus returning null after recovery', async () => {
      mockSafeInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'recover_rfid_scanner') return Promise.resolve(undefined);
        if (cmd === 'get_rfid_scanner_status') return Promise.resolve({ is_available: true });
        if (cmd === 'get_rfid_service_status') return Promise.resolve(null);
        return Promise.resolve(undefined);
      });

      const onAfter = vi.fn().mockResolvedValue(undefined);
      render(<ScannerRestartButton onAfterRecover={onAfter} />);
      await userEvent.click(screen.getByLabelText('Lesegerät neu starten'));

      await waitFor(() => {
        expect(screen.getByText(/Lesegerät konnte nicht neu gestartet werden/)).toBeInTheDocument();
      });
    });
  });
});
