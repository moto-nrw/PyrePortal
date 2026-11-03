import { chromium } from '@playwright/test';

import { assertPatchedChrome, SECURE_CHROME_LAUNCH_OPTIONS } from './secure-chrome';

/** Fails the run before any test when the system Google Chrome is missing or unpatched. */
export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch(SECURE_CHROME_LAUNCH_OPTIONS);
  try {
    assertPatchedChrome(browser.version());
  } finally {
    await browser.close();
  }
}
