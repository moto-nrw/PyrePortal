import { readFileSync } from 'node:fs';

import { test } from '@playwright/test';

import { buildProductScreenshots } from './product';
import { SHOTS } from './shots';

/**
 * Frames the raw captures of both device projects (playwright.config.ts runs
 * this project only after `gkt` and `ipad` passed) and writes the release
 * asset: SHOT_OUT (default screenshots/output/product), version SHOT_VERSION
 * (default: package.json).
 */
test('frame raw captures into product screenshots', async () => {
  test.setTimeout(15 * 60_000);
  const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
  const manifest = await buildProductScreenshots({
    rawDir: './screenshots/output/raw',
    outDir: process.env.SHOT_OUT ?? './screenshots/output/product',
    version: process.env.SHOT_VERSION ?? pkg.version,
    shots: SHOTS,
    log: message => console.log(message),
  });
  console.log(`Product screenshots ${manifest.version}: ${manifest.shots.length} shots`);
});
