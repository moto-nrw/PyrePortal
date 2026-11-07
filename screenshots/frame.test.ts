// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { DEVICE_IDS, DEVICES, type DeviceSpec } from './devices';
import { BEZEL_DIR, WEBP_WIDTHS, frameMockup, webpVariants } from './frame';

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

async function pixelAt(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return [...data.subarray(index, index + 4)];
}

function solidRaw(device: DeviceSpec, rgb: { r: number; g: number; b: number }) {
  const { width, height } = device.viewport;
  return sharp({
    create: {
      width: width * device.deviceScaleFactor,
      height: height * device.deviceScaleFactor,
      channels: 3,
      background: rgb,
    },
  })
    .png()
    .toBuffer();
}

describe.each(DEVICE_IDS)('bezel of %s', id => {
  const device = DEVICES[id];

  it('has the declared size and a transparent screen inside an opaque frame', async () => {
    const bezel = await sharp(join(BEZEL_DIR, device.bezel.file)).png().toBuffer();
    const meta = await sharp(bezel).metadata();
    expect([meta.width, meta.height]).toEqual([device.bezel.width, device.bezel.height]);

    const { left, top, width, height } = device.bezel.screen;
    const midX = left + Math.floor(width / 2);
    const midY = top + Math.floor(height / 2);
    expect(await alphaAt(bezel, midX, midY)).toBe(0);
    // A few pixels outside each screen edge the device frame is opaque.
    expect(await alphaAt(bezel, left - 8, midY)).toBe(255);
    expect(await alphaAt(bezel, left + width + 8, midY)).toBe(255);
    expect(await alphaAt(bezel, midX, top - 8)).toBe(255);
    expect(await alphaAt(bezel, midX, top + height + 8)).toBe(255);
  });
});

describe('frameMockup', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('shows the raw image on the screen and keeps the background transparent', async () => {
    const device = DEVICES.gkt;
    const mockup = await frameMockup(await solidRaw(device, { r: 255, g: 0, b: 0 }), device);
    const meta = await sharp(mockup).metadata();
    expect([meta.width, meta.height]).toEqual([device.bezel.width, device.bezel.height]);

    const { left, top, width, height } = device.bezel.screen;
    expect(await pixelAt(mockup, left + width / 2, top + height / 2)).toEqual([255, 0, 0, 255]);
    expect(await alphaAt(mockup, 0, 0)).toBe(0);
    expect(await alphaAt(mockup, device.bezel.width - 1, device.bezel.height - 1)).toBe(0);
  });

  it('rejects a bezel whose size differs from devices.ts', async () => {
    dir = await mkdtemp(join(tmpdir(), 'bezel-'));
    const device = DEVICES.gkt;
    await writeFile(
      join(dir, device.bezel.file),
      await sharp({
        create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toBuffer()
    );
    await expect(
      frameMockup(await solidRaw(device, { r: 0, g: 0, b: 0 }), device, dir)
    ).rejects.toThrow(/10×10/);
  });
});

describe('webpVariants', () => {
  it('produces every width and marks upscaled ones', async () => {
    const png = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const variants = await webpVariants(png);
    expect(variants.map(variant => variant.width)).toEqual([...WEBP_WIDTHS]);
    expect(variants.map(variant => variant.upscaled)).toEqual(
      WEBP_WIDTHS.map(width => width > 1000)
    );
  });
});
