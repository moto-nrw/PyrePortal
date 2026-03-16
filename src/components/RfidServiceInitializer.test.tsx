import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { isRfidEnabled } from '../utils/tauriContext';

import { RfidServiceInitializer } from './RfidServiceInitializer';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    initializeNfc: vi.fn(),
  },
}));

const { adapter } = await import('@platform');
const mockInitializeNfc = vi.mocked(adapter.initializeNfc);

const mockIsRfidEnabled = vi.mocked(isRfidEnabled);

beforeEach(() => {
  mockIsRfidEnabled.mockReturnValue(false);
  mockInitializeNfc.mockResolvedValue(undefined);
});

describe('RfidServiceInitializer', () => {
  it('renders null', () => {
    const { container } = render(<RfidServiceInitializer />);
    expect(container.innerHTML).toBe('');
  });

  it('calls adapter.initializeNfc when RFID is enabled', async () => {
    mockIsRfidEnabled.mockReturnValue(true);
    render(<RfidServiceInitializer />);

    await vi.waitFor(() => {
      expect(mockInitializeNfc).toHaveBeenCalledOnce();
    });
  });

  it('does not call adapter.initializeNfc when RFID is disabled', async () => {
    mockIsRfidEnabled.mockReturnValue(false);
    render(<RfidServiceInitializer />);

    // Give useEffect time to run
    await vi.waitFor(() => {
      expect(mockInitializeNfc).not.toHaveBeenCalled();
    });
  });

  it('handles initializeNfc failure gracefully', async () => {
    mockIsRfidEnabled.mockReturnValue(true);
    mockInitializeNfc.mockRejectedValueOnce(new Error('init failed'));

    // Should not throw
    render(<RfidServiceInitializer />);

    await vi.waitFor(() => {
      expect(mockInitializeNfc).toHaveBeenCalledOnce();
    });
  });
});
