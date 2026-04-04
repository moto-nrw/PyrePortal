import { defineConfig } from '@playwright/test';

/**
 * Playwright config for automated GKT screenshot capture.
 *
 * Viewport: 1280x800 — matches GKT-Kiosk tablet (10.1" TFT-LCD, 16:10).
 * Runs against the Vite dev server with BUILD_TARGET=browser (default).
 * API points at staging via VITE_API_BASE_URL env var.
 */
export default defineConfig({
  testDir: './screenshots',
  outputDir: './screenshots/test-results',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Sequential — screens depend on prior navigation state

  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    screenshot: 'off', // We take screenshots manually in the test
  },

  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
