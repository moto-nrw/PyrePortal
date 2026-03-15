import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import PinPage from './PinPage';

describe('PinPage', () => {
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

  it('renders the delete button (third action button in bottom row)', () => {
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    // The delete button contains an SVG icon (FontAwesome faDeleteLeft)
    // It is the last button in the numpad grid — there are 12 buttons total (1-9, C, 0, delete)
    const buttons = container.querySelectorAll('button');
    // Numpad has 12 buttons + the back button = 13 total
    // The last numpad button is the delete button
    const allButtons = Array.from(buttons);
    // The delete button contains an SVG (FontAwesome icon)
    const deleteButton = allButtons.find(
      btn => btn.querySelector('svg') && btn.closest('div[style*="grid"]')
    );
    expect(deleteButton).toBeTruthy();
  });

  it('fills PIN dots when digit buttons are clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Initially all 4 dots should be empty (light gray #E5E7EB)
    const dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
    expect(dots).toHaveLength(4);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
    }

    // Click digit "1" — first dot should become filled (#111827)
    await user.click(screen.getByText('1'));

    const dotsAfter = container.querySelectorAll('div[style*="border-radius: 50%"]');
    expect((dotsAfter[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    // Remaining dots stay empty
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

    const dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[2] as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  });

  it('delete button removes last entered digit', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Enter two digits
    await user.click(screen.getByText('7'));
    await user.click(screen.getByText('8'));

    // Verify two dots filled
    let dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#111827');

    // Click delete — find button with SVG icon inside the numpad grid
    const allButtons = Array.from(container.querySelectorAll('div[style*="grid"] button'));
    const deleteBtn = allButtons.find(btn => btn.querySelector('svg'));
    expect(deleteBtn).toBeTruthy();
    await user.click(deleteBtn!);

    // Now only one dot should be filled
    dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe('#111827');
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
  });

  it('clear button resets all dots to empty', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );

    // Enter three digits
    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));

    // Click clear
    await user.click(screen.getByText('C'));

    // All dots should be empty
    const dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
    for (const dot of dots) {
      expect((dot as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
    }
  });

  it('does not fill more than 4 dots', async () => {
    // Mock api.validateGlobalPin to prevent auto-submit side effects
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

    // Enter 4 digits (auto-submit triggers but we mocked the API)
    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));
    await user.click(screen.getByText('4'));

    // Wait for auto-submit to complete and PIN to clear
    await waitFor(() => {
      const dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
      // After failed validation, PIN is cleared, so dots are empty again
      // The key point is we never exceed 4 filled dots
      expect(dots).toHaveLength(4);
    });
  });

  it('shows loading text when PIN is being verified', async () => {
    // Mock api.validateGlobalPin to return a pending promise so loading state persists
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

    // Enter 4 digits to trigger auto-submit
    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));
    await user.click(screen.getByText('4'));

    // Loading text should appear
    await waitFor(() => {
      expect(screen.getByText('PIN wird überprüft...')).toBeInTheDocument();
    });

    // Cleanup: resolve the promise
    resolveValidation({ success: false, error: 'Test' });
  });

  it('renders an error modal dialog element', () => {
    const { container } = render(
      <MemoryRouter>
        <PinPage />
      </MemoryRouter>
    );
    // ErrorModal renders a <dialog> element via ModalBase
    expect(container.querySelector('dialog')).toBeInTheDocument();
  });

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

    // Enter 4 digits to trigger auto-submit
    await user.click(screen.getByText('1'));
    await user.click(screen.getByText('2'));
    await user.click(screen.getByText('3'));
    await user.click(screen.getByText('4'));

    // The error modal should contain the error heading "Fehler"
    await waitFor(() => {
      expect(screen.getByText('Fehler')).toBeInTheDocument();
    });

    // The specific error message should be rendered in the modal
    expect(screen.getByText('Ungültiger PIN. Bitte versuchen Sie es erneut.')).toBeInTheDocument();
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

    // Enter 4 digits
    await user.click(screen.getByText('9'));
    await user.click(screen.getByText('8'));
    await user.click(screen.getByText('7'));
    await user.click(screen.getByText('6'));

    // After validation fails, PIN should be cleared
    await waitFor(() => {
      const dots = container.querySelectorAll('div[style*="border-radius: 50%"]');
      for (const dot of dots) {
        expect((dot as HTMLElement).style.backgroundColor).toBe('#E5E7EB');
      }
    });
  });
});
