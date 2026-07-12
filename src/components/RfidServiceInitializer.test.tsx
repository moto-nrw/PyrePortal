import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { RfidServiceInitializer } from './RfidServiceInitializer';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    platform: 'browser',
    initializeNfc: vi.fn(),
  },
}));

const { adapter } = await import('@platform');
const mockInitializeNfc = vi.mocked(adapter.initializeNfc);

const setPlatform = (platform: string) => {
  (adapter as unknown as Record<string, unknown>).platform = platform;
};

beforeEach(() => {
  setPlatform('browser');
  mockInitializeNfc.mockResolvedValue(undefined);
});

describe('RfidServiceInitializer', () => {
  it('renders null', () => {
    const { container } = render(<RfidServiceInitializer />);
    expect(container.innerHTML).toBe('');
  });

  it('calls adapter.initializeNfc on GKT (real NFC platform)', async () => {
    setPlatform('gkt');
    render(<RfidServiceInitializer />);

    await vi.waitFor(() => {
      expect(mockInitializeNfc).toHaveBeenCalledOnce();
    });
  });

  it('does not call adapter.initializeNfc on mock platforms', async () => {
    setPlatform('browser');
    render(<RfidServiceInitializer />);

    // Give useEffect time to run
    await vi.waitFor(() => {
      expect(mockInitializeNfc).not.toHaveBeenCalled();
    });
  });

  it('handles initializeNfc failure gracefully', async () => {
    setPlatform('gkt');
    mockInitializeNfc.mockRejectedValueOnce(new Error('init failed'));

    // Should not throw
    render(<RfidServiceInitializer />);

    await vi.waitFor(() => {
      expect(mockInitializeNfc).toHaveBeenCalledOnce();
    });
  });
});
