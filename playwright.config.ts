import process from 'node:process';

import { defineConfig } from '@playwright/test';

import { SECURE_CHROME_LAUNCH_OPTIONS } from './screenshots/secure-chrome';
import { SCREENSHOT_TAG } from './screenshots/tags';

/**
 * Playwright config for the product screenshots and the RFID parity check.
 *
 * Projects:
 *   gkt, ipad   capture.spec.ts once per device (screenshots/devices.ts)
 *   product     frames both captures into the release asset; runs only after
 *               gkt and ipad passed
 *   rfid-parity scan-hook parity check with HTTP fixtures, no backend
 *
 * Runs against the Vite dev server with BUILD_TARGET=browser (default).
 * Needs a local backend on VITE_API_BASE_URL (see screenshots/README.md).
 *
 * VITE_MOCK_RFID_TAGS is pinned to a single tag so every mock scan is
 * deterministic. The dev server is always started by Playwright
 * (reuseExistingServer: false) so this pin is guaranteed to apply —
 * stop any already-running dev server on port 1420 first.
 *
 * Browser: the system Google Chrome with the sandbox on, never the bundled
 * Chromium (see screenshots/secure-chrome.ts). globalSetup aborts the run when
 * that Chrome is older than MIN_CHROME_VERSION.
 */
export default defineConfig({
  testDir: './screenshots',
  outputDir: './screenshots/test-results',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Sequential — screens depend on prior navigation state and one backend
  globalSetup: './screenshots/global-setup.ts',

  use: {
    browserName: 'chromium',
    launchOptions: { ...SECURE_CHROME_LAUNCH_OPTIONS },
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    screenshot: 'off', // We take screenshots manually in the test
  },

  projects: [
    { name: 'gkt', testMatch: 'capture.spec.ts' },
    // After gkt: both devices share one backend and must not run at once.
    { name: 'ipad', testMatch: 'capture.spec.ts', dependencies: ['gkt'] },
    { name: 'product', testMatch: 'product.spec.ts', dependencies: ['gkt', 'ipad'] },
    { name: 'rfid-parity', testMatch: 'rfid-parity.spec.ts' },
  ],

  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      VITE_MOCK_RFID_TAGS: SCREENSHOT_TAG,
    },
  },
});
