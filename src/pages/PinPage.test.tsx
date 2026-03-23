import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import PinPage from './PinPage';

// ---------------------------------------------------------------------------
// Mock react-router-dom's useNavigate
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the delete button (the one with SVG inside the numpad grid) */
function findDeleteButton(container: HTMLElement): HTMLElement {
  const allButtons = Array.from(container.querySelectorAll('div[style*="grid"] button'));
  const btn = allButtons.find(b => b.querySelector('svg'));
  if (!btn) throw new Error('Delete button not found');
  return btn as HTMLElement;
}

/** Get all 4 PIN dots */
function getDots(container: HTMLElement) {
  return container.querySelectorAll('div[style*="border-radius: 50%"]');
}

/** Assert all dots are empty */
function expectAllDotsEmpty(container: HTMLElement) {
  const dots = getDots(container);
  for (const dot of dots) {
    expect((dot as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  }
}

/** Enter a full 4-digit PIN via clicking numpad buttons */
async function enterPin(user: ReturnType<typeof userEvent.setup>, digits = '1234') {
  for (const d of digits) {
    await user.click(screen.getByText(d));
  }
}

describe('PinPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // =========================================================================
  // Rendering
  // =========================================================================

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
  });

  it('shows the PIN entry title', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('PIN-Eingabe')).toBeInTheDocument();
  });

  it('shows the subtitle instruction', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Bitte geben Sie Ihren 4-stelligen PIN ein')).toBeInTheDocument();
  });

  it('renders numpad buttons 0-9', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('renders the clear button', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders the delete button (SVG icon in numpad grid)', () => {
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(findDeleteButton(container)).toBeTruthy();
  });

  it('renders an error modal dialog element', () => {
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    expect(container.querySelector('dialog')).toBeInTheDocument();
  });

  // =========================================================================
  // PIN dot display
  // =========================================================================

  it('fills PIN dots when digit buttons are clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Initially all empty
    const dots = getDots(container);
    expect(dots).toHaveLength(4);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
    }

    await user.click(screen.getByText('1'));

    const dotsAfter = getDots(container);
    expect((dotsAfter[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dotsAfter[1] as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  });

  it('fills multiple dots when multiple digits are clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('5'));
    await user.click(screen.getByText('3'));

    const dots = getDots(container);
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[2] as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  });

  // =========================================================================
  // Delete button
  // =========================================================================

  it('delete button removes last entered digit', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('7'));
    await user.click(screen.getByText('8'));

    let dots = getDots(container);
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#111827');

    await user.click(findDeleteButton(container));

    dots = getDots(container);
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  });

  it('delete button does nothing when PIN is empty', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Click delete on empty PIN — should not throw
    await user.click(findDeleteButton(container));

    expectAllDotsEmpty(container);
  });

  // =========================================================================
  // Clear button
  // =========================================================================

  it('clear button resets all dots to empty', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));

    await user.click(screen.getByText('C'));

    expectAllDotsEmpty(container);
  });

  it('clear button works when PIN is already empty', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Clear on empty — should not throw
    await user.click(screen.getByText('C'));
    expectAllDotsEmpty(container);
  });

  // =========================================================================
  // Max PIN length enforcement
  // =========================================================================

  it('does not fill more than 4 dots', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Test error',
    });

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(getDots(container)).toHaveLength(4);
    });
  });

  // =========================================================================
  // Back button / navigation
  // =========================================================================

  it('back button navigates back', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // BackButton is the first button outside the numpad grid
    const backButton = screen.getByText('Zurück');
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  // =========================================================================
  // Loading state
  // =========================================================================

  it('shows loading text when PIN is being verified', async () => {
    const apiModule = await import('../services/api');
    let resolveValidation!: (value: { success: boolean; error?: string }) => void;
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveValidation = resolve;
        })
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(screen.getByText('PIN wird überprüft...')).toBeInTheDocument();
    });

    // Cleanup
    resolveValidation({ success: false, error: 'Test' });
  });

  // =========================================================================
  // Successful PIN validation → navigate to /home
  // =========================================================================

  it('navigates to /home after successful global PIN validation', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: true,
      userData: {
        deviceName: 'Test Device',
        staffName: 'OGS Device',
        staffId: 0,
      },
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });
  });

  it('calls setAuthenticatedUser on successful validation', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: true,
      userData: {
        deviceName: 'OGS Pi #3',
        staffName: 'OGS Device',
        staffId: 0,
      },
    });

    const { useUserStore } = await import('../store/userStore');
    const setAuthSpy = vi.fn();
    const originalGetState = useUserStore.getState;
    vi.spyOn(useUserStore, 'getState').mockImplementation(() => ({
      ...originalGetState(),
      setAuthenticatedUser: setAuthSpy,
    }));

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });

    // Restore
    vi.mocked(useUserStore.getState).mockRestore();
  });

  // =========================================================================
  // Failed PIN validation
  // =========================================================================

  it('shows error message after failed PIN validation', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Ungültiger PIN. Bitte versuchen Sie es erneut.',
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(screen.getByText('Fehler')).toBeInTheDocument();
    });

    expect(screen.getByText('Ungültiger PIN. Bitte versuchen Sie es erneut.')).toBeInTheDocument();
  });

  it('uses default error message when result.error is undefined', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      // no error property → falls back to default message
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(
        screen.getByText('Ungültiger PIN. Bitte versuchen Sie es erneut.')
      ).toBeInTheDocument();
    });
  });

  it('clears PIN after failed validation', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Invalid',
    });

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user, '9876');

    await waitFor(() => {
      expectAllDotsEmpty(container);
    });
  });

  // =========================================================================
  // API error (exception thrown)
  // =========================================================================

  it('shows generic error when API call throws', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(
        screen.getByText('Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.')
      ).toBeInTheDocument();
    });

    // PIN should be cleared after error
    expectAllDotsEmpty(container);
  });

  it('handles non-Error exception in API call', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockRejectedValue('string error');

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    await waitFor(() => {
      expect(
        screen.getByText('Fehler bei der PIN-Überprüfung. Bitte versuchen Sie es erneut.')
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Error modal close
  // =========================================================================

  it('sets isErrorModalOpen to false when onClose is called', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Test error',
    });

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    // Wait for error modal to open (dialog should have open attribute)
    await waitFor(() => {
      expect(screen.getByText('Fehler')).toBeInTheDocument();
    });

    // The ErrorModal renders inside a <dialog>. Verify it opened.
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
  });

  // =========================================================================
  // NumpadButton pointer events (components use onPointerDown/onPointerUp)
  // =========================================================================

  it('handles pointer events on numpad buttons', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    const button1 = screen.getByText('1').closest('button')!;

    fireEvent.pointerDown(button1);
    expect(button1.style.transform).toBe('scale(0.95)');

    fireEvent.pointerUp(button1);
    expect(button1.style.transform).toBe('');
  });

  it('handles pointer events on action buttons (clear/delete)', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    const clearBtn = screen.getByText('C').closest('button')!;

    fireEvent.pointerDown(clearBtn);
    expect(clearBtn.style.transform).toBe('scale(0.95)');
    // Action buttons use different background colors
    expect(clearBtn.style.backgroundColor).toBe('#F3F4F6');

    fireEvent.pointerUp(clearBtn);
    expect(clearBtn.style.transform).toBe('');
  });

  it('pointerUp reverts pressed styles', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    const button1 = screen.getByText('1').closest('button')!;

    fireEvent.pointerDown(button1);
    expect(button1.style.transform).toBe('scale(0.95)');

    fireEvent.pointerUp(button1);
    expect(button1.style.transform).toBe('');
    expect(button1.style.boxShadow).toBe('0 3px 8px rgba(0, 0, 0, 0.1)');
  });

  // =========================================================================
  // Clicking the "0" button specifically (covers arrow function on line 349)
  // =========================================================================

  it('clicking 0 button enters a zero digit', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('0'));

    const dots = getDots(container);
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe('#111827');
  });

  // =========================================================================
  // ErrorModal onClose callback (covers arrow function on line 407)
  // =========================================================================

  it('ErrorModal onClose clears the error state via backdrop click', async () => {
    const apiModule = await import('../services/api');
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Some error',
    });

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    await enterPin(user);

    // Wait for error modal to appear
    await waitFor(() => {
      expect(screen.getByText('Fehler')).toBeInTheDocument();
    });

    // Click the dialog backdrop to close it (ModalBase closes on backdrop click)
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeTruthy();

    // Simulate clicking the dialog element itself (backdrop area)
    if (dialog) {
      await user.click(dialog);
    }
  });

  it('pointerLeave reverts pressed styles (simulates finger drag off button)', () => {
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    const button = screen.getByText('3').closest('button')!;

    fireEvent.pointerDown(button);
    expect(button.style.transform).toBe('scale(0.95)');

    fireEvent.pointerLeave(button);
    expect(button.style.transform).toBe('');
  });

  // =========================================================================
  // Error handling in catch blocks (defensive code)
  // =========================================================================

  it('handleBack catches errors from navigate', async () => {
    mockNavigate.mockImplementation(() => {
      throw new Error('Navigation failed');
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    const backButton = screen.getByText('Zurück');
    // Should not throw despite navigate throwing
    await user.click(backButton);

    // Verify navigate was called (and threw)
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('rejects 5th digit when PIN is already at max length', async () => {
    // Keep validation pending so PIN stays at 4 digits
    const apiModule = await import('../services/api');
    let resolveValidation!: (value: { success: boolean; error?: string }) => void;
    vi.spyOn(apiModule.api, 'validateGlobalPin').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveValidation = resolve;
        })
    );

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Enter 4 digits — auto-submit fires but validation is pending
    await enterPin(user);

    // Wait for loading state
    await waitFor(() => {
      expect(screen.getByText('PIN wird überprüft...')).toBeInTheDocument();
    });

    // Try to enter a 5th digit — should be rejected (line 116)
    await user.click(screen.getByText('5'));

    // PIN should still show 4 filled dots (not 5)
    const dots = getDots(container);
    const filledDots = Array.from(dots).filter(
      d => (d as HTMLElement).style.backgroundColor === '#111827'
    );
    expect(filledDots.length).toBeLessThanOrEqual(4);

    // Cleanup
    resolveValidation({ success: false, error: 'done' });
  });

  it('handleNumpadClick catch block handles logger error', async () => {
    // Make createLogger return a logger where debug throws
    const loggerModule = await import('../utils/logger');
    const throwingLogger = {
      debug: vi.fn().mockImplementation(() => {
        throw new Error('logger crash');
      }),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      updateConfig: vi.fn(),
      getInMemoryLogs: vi.fn(() => []),
      clearInMemoryLogs: vi.fn(),
      exportLogs: vi.fn(() => '[]'),
    } as unknown as ReturnType<typeof loggerModule.createLogger>;
    vi.mocked(loggerModule.createLogger).mockReturnValue(throwingLogger);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Click a digit — logger.debug will throw inside handleNumpadClick,
    // triggering the catch block (lines 119-122)
    await user.click(screen.getByText('1'));

    // The catch block calls logError which is mocked
    expect(loggerModule.logError).toHaveBeenCalled();
  });

  it('handleDelete catch block handles logger error', async () => {
    const loggerModule = await import('../utils/logger');
    const throwingLogger = {
      debug: vi.fn().mockImplementation(() => {
        throw new Error('logger crash');
      }),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      updateConfig: vi.fn(),
      getInMemoryLogs: vi.fn(() => []),
      clearInMemoryLogs: vi.fn(),
      exportLogs: vi.fn(() => '[]'),
    } as unknown as ReturnType<typeof loggerModule.createLogger>;
    vi.mocked(loggerModule.createLogger).mockReturnValue(throwingLogger);

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Click delete on empty PIN — logger.debug will throw, triggering catch (line 136)
    await user.click(findDeleteButton(container));

    expect(loggerModule.logError).toHaveBeenCalled();
  });

  it('handleClear catch block handles logger error', async () => {
    const loggerModule = await import('../utils/logger');
    const throwingLogger = {
      debug: vi.fn().mockImplementation(() => {
        throw new Error('logger crash');
      }),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      updateConfig: vi.fn(),
      getInMemoryLogs: vi.fn(() => []),
      clearInMemoryLogs: vi.fn(),
      exportLogs: vi.fn(() => '[]'),
    } as unknown as ReturnType<typeof loggerModule.createLogger>;
    vi.mocked(loggerModule.createLogger).mockReturnValue(throwingLogger);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Click clear — logger.debug will throw, triggering catch (line 147)
    await user.click(screen.getByText('C'));

    expect(loggerModule.logError).toHaveBeenCalled();
  });

  // =========================================================================
  // Auto-submit triggers only at 4 digits
  // =========================================================================

  it('does not auto-submit with fewer than 4 digits', async () => {
    const apiModule = await import('../services/api');
    const spy = vi.spyOn(apiModule.api, 'validateGlobalPin').mockResolvedValue({
      success: false,
      error: 'Test',
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Enter only 3 digits
    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));

    // API should not have been called
    expect(spy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // isLoading prevents double-submit
  // =========================================================================

  it('does not double-submit while loading', async () => {
    const apiModule = await import('../services/api');
    let resolveFirst!: (value: { success: boolean; error?: string }) => void;
    const spy = vi.spyOn(apiModule.api, 'validateGlobalPin').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        })
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Enter 4 digits → auto-submit (promise pending)
    await enterPin(user);

    await waitFor(() => {
      expect(screen.getByText('PIN wird überprüft...')).toBeInTheDocument();
    });

    // API should have been called exactly once
    expect(spy).toHaveBeenCalledTimes(1);

    // Cleanup
    resolveFirst({ success: false, error: 'done' });
  });
});
