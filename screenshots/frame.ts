import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { DeviceSpec } from './devices';

// Framing, the same as project-phoenix frontend/scripts/product-screenshots/frame.ts:
// sharp puts the raw image under the unchanged bezel. The background stays
// transparent; only the device is opaque.

/** Web widths in which every image also exists as WebP. */
export const WEBP_WIDTHS = [640, 960, 1280, 1600, 2400, 3200] as const;

export const BEZEL_DIR = join(dirname(fileURLToPath(import.meta.url)), 'bezels');

/**
 * Frames a raw image. The raw image lies under the bezel: its screen is
 * transparent, its edges and rounded corners cover the image, and everything
 * outside the device stays transparent.
 */
export async function frameMockup(
  raw: Buffer,
  device: DeviceSpec,
  bezelDir: string = BEZEL_DIR
): Promise<Buffer> {
  const { file, width, height, screen } = device.bezel;
  const bezel = await readFile(join(bezelDir, file));
  const meta = await sharp(bezel).metadata();
  if (meta.width !== width || meta.height !== height) {
    throw new Error(
      `Bezel ${file} is ${meta.width}×${meta.height}, expected ${width}×${height}. Bezel and screen rectangle in devices.ts belong together.`
    );
  }
  const screenshot = await sharp(raw)
    .resize(screen.width, screen.height, { fit: 'fill' })
    .toBuffer();
  const composed = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: screenshot, left: screen.left, top: screen.top },
      { input: bezel, left: 0, top: 0 },
    ])
    .raw()
    .toBuffer();

  // Corners of the rectangular raw image can lie outside the rounded device
  // outline, where the bezel is transparent. Everything reachable from the
  // image border over fully transparent bezel pixels becomes transparent again.
  const bezelAlpha = await sharp(bezel).ensureAlpha().extractChannel(3).raw().toBuffer();
  const outside = outsideMask(bezelAlpha, width, height);
  for (let index = 0; index < outside.length; index += 1) {
    if (outside[index]) composed.fill(0, index * 4, index * 4 + 4);
  }
  return sharp(composed, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Fully transparent pixels reachable from the image border (flood fill). */
function outsideMask(alpha: Buffer, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const index = y * width + x;
    if (mask[index] === 0 && alpha[index] === 0) {
      mask[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  for (let index = stack.pop(); index !== undefined; index = stack.pop()) {
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return mask;
}

export interface WebpVariant {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
  /** The original is narrower than the target width: the image was enlarged. */
  readonly upscaled: boolean;
}

/**
 * WebP sizes of a PNG. All widths always exist so a `srcSet` never points at a
 * missing file; a narrower original is enlarged and marked in the manifest.
 */
export async function webpVariants(png: Buffer): Promise<WebpVariant[]> {
  const sourceWidth = (await sharp(png).metadata()).width ?? 0;
  return Promise.all(
    WEBP_WIDTHS.map(async width => {
      const { data, info } = await sharp(png)
        .resize({ width, kernel: 'lanczos3' })
        .webp({ quality: 92, alphaQuality: 100, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, data, upscaled: width > sourceWidth };
    })
  );
}
