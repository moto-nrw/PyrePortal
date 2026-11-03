import process from 'node:process';

import { defineConfig } from '@playwright/test';

import { SECURE_CHROME_LAUNCH_OPTIONS } from './screenshots/secure-chrome';
import { SCREENSHOT_TAG } from './screenshots/tags';

/**
 * Playwright config for automated GKT screenshot capture.
 *
 * Viewport: 1280x800 — matches GKT-Kiosk tablet (10.1" TFT-LCD, 16:10).
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
  workers: 1, // Sequential — screens depend on prior navigation state
  globalSetup: './screenshots/global-setup.ts',

  use: {
    browserName: 'chromium',
    launchOptions: { ...SECURE_CHROME_LAUNCH_OPTIONS },
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    screenshot: 'off', // We take screenshots manually in the test
  },

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
