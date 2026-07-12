import type { NfcScanEvent } from '../platform/adapter';
import { getSecureRandomInt } from '../utils/crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('mockScanSource');

// Mock scanning interval for development
let mockScanInterval: ReturnType<typeof setInterval> | null = null;
let mockScanCounter = 0;

export const isMockScanSourceRunning = (): boolean => mockScanInterval !== null;

// Default realistic hardware format tags
const DEFAULT_MOCK_TAGS = [
  '04:D6:94:82:97:6A:80',
  '04:A7:B3:C2:D1:E0:F5',
  '04:12:34:56:78:9A:BC',
  '04:FE:DC:BA:98:76:54',
  '04:11:22:33:44:55:66',
];

/**
 * Resolve the mock tag list from `VITE_MOCK_RFID_TAGS` (read on every call so
 * tests can swap it at runtime) or the built-in defaults, and pick one tag
 * using unbiased secure randomness.
 */
export const pickRandomMockTag = (): string => {
  const envTags = import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined;
  const mockStudentTags: string[] = envTags
    ? envTags.split(',').map(tag => tag.trim())
    : DEFAULT_MOCK_TAGS;
  return mockStudentTags[getSecureRandomInt(mockStudentTags.length)];
};

/**
 * Starts generating mock RFID scans for browser development. Tags come from
 * `pickRandomMockTag`. Caller must ensure the source is not already
 * running (see `isMockScanSourceRunning`).
 */
export const startMockScanSource = (onScan: (event: NfcScanEvent) => void): void => {
  // Generate mock scans every 3-5 seconds
  mockScanInterval = setInterval(
    () => {
      const mockTagId = pickRandomMockTag();
      const scanId = ++mockScanCounter;

      logger.info('Mock RFID scan generated', {
        tagId: mockTagId,
        scanId,
        platform: 'Development Mock',
      });

      onScan({ tagId: mockTagId, scanId });
    },
    5000 + getSecureRandomInt(5000)
  ); // Random interval between 5-10 seconds
};

/** Stops the mock scan interval. Logging is the caller's responsibility. */
export const stopMockScanSource = (): void => {
  if (mockScanInterval) {
    clearInterval(mockScanInterval);
    mockScanInterval = null;
  }
};

/** Reset module-level state between tests. Not for production use. */
export const resetMockScanSourceForTesting = (): void => {
  stopMockScanSource();
  mockScanCounter = 0;
};
