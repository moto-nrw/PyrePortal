import type { LaunchOptions } from '@playwright/test';

/**
 * Interim hardening until Playwright ships a patched Chromium (moto-nrw/PyrePortal#496,
 * moto-nrw/project-phoenix#5612).
 *
 * The Chromium bundled with Playwright 1.64.1 (156.0.8078.4) is affected by
 * CVE-2026-118306, -118331, -118344 and -118348, all fixed in Chrome 156.0.8078.73.
 * Playwright also adds --no-sandbox unless chromiumSandbox is true. Every launch
 * therefore uses the system Google Chrome with the sandbox enabled.
 */
export const MIN_CHROME_VERSION = '156.0.8078.73';

export const SECURE_CHROME_LAUNCH_OPTIONS = {
  channel: 'chrome',
  chromiumSandbox: true,
} as const satisfies LaunchOptions;

function parseVersion(version: string): number[] {
  const trimmed = version.trim();
  if (!/^\d+(\.\d+)*$/.test(trimmed)) {
    throw new Error(`Unrecognised Chrome version "${version}"`);
  }
  return trimmed.split('.').map(Number);
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Throws unless `version` is at least MIN_CHROME_VERSION (dotted numeric compare). */
export function assertPatchedChrome(version: string): void {
  if (compareVersions(parseVersion(version), parseVersion(MIN_CHROME_VERSION)) >= 0) return;
  throw new Error(
    `Google Chrome ${version} is older than ${MIN_CHROME_VERSION} and has known critical ` +
      'vulnerabilities. Update Google Chrome (CI: pnpm exec playwright install --with-deps chrome).'
  );
}
