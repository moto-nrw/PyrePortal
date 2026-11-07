// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEVICE_IDS, DEVICES, type DeviceId } from './devices';
import { WEBP_WIDTHS } from './frame';
import { buildProductScreenshots, type Manifest } from './product';
import { CAPTURED_FILE } from './shots';

const SHOTS = [
  { id: 'start', titel: 'Startbildschirm' },
  { id: 'pin-eingabe', titel: 'PIN-Eingabe' },
];

let root: string;
let rawDir: string;
let outDir: string;

async function writeRaw(device: DeviceId, id: string, pfad: string) {
  const spec = DEVICES[device];
  const dir = join(rawDir, device);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${id}.png`),
    await sharp({
      create: {
        width: spec.viewport.width * spec.deviceScaleFactor,
        height: spec.viewport.height * spec.deviceScaleFactor,
        channels: 3,
        background: { r: 30, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer()
  );
  const capturedPath = join(dir, CAPTURED_FILE);
  const captured = JSON.parse(await readFile(capturedPath, 'utf8').catch(() => '{}')) as Record<
    string,
    unknown
  >;
  captured[id] = { pfad };
  await writeFile(capturedPath, JSON.stringify(captured));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'product-screenshots-'));
  rawDir = join(root, 'raw');
  outDir = join(root, 'product');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Framing and WebP encoding of full-size images takes a few seconds.
describe('buildProductScreenshots', { timeout: 60_000 }, () => {
  it('writes raw images, mockups, WebP sizes, videos and the manifest', async () => {
    for (const device of DEVICE_IDS) {
      await writeRaw(device, 'start', '/');
      await writeRaw(device, 'pin-eingabe', '/pin');
      await writeFile(join(rawDir, device, 'user-journey.webm'), 'video');
    }

    const manifest = await buildProductScreenshots({
      rawDir,
      outDir,
      version: '1.12.0',
      shots: SHOTS,
      now: new Date('2026-11-07T12:00:00Z'),
    });

    expect(manifest.format).toBe('moto-product-screenshots/v1');
    expect(manifest.version).toBe('1.12.0');
    expect(manifest.zeitpunkt).toBe('2026-11-07T12:00:00.000Z');
    expect(manifest.shots.map(shot => [shot.id, shot.titel, shot.portal, shot.pfad])).toEqual([
      ['start', 'Startbildschirm', 'kiosk', '/'],
      ['pin-eingabe', 'PIN-Eingabe', 'kiosk', '/pin'],
    ]);

    const files = manifest.shots[0].dateien;
    // Per device: raw + mockup, each as PNG plus every WebP width.
    expect(files).toHaveLength(DEVICE_IDS.length * 2 * (1 + WEBP_WIDTHS.length));
    const mockup = files.find(file => file.pfad === 'start/gkt.png');
    expect(mockup).toMatchObject({
      art: 'mockup',
      geraet: 'gkt',
      format: 'png',
      breite: DEVICES.gkt.bezel.width,
      hoehe: DEVICES.gkt.bezel.height,
    });
    expect(files.find(file => file.pfad === 'start/roh-ipad.png')).toMatchObject({
      art: 'roh',
      breite: 2420,
      hoehe: 1668,
    });

    const written = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as Manifest;
    expect(written).toEqual(manifest);
    for (const file of files) {
      expect((await readFile(join(outDir, file.pfad))).length).toBe(file.bytes);
    }
    expect(manifest.videos.map(video => video.pfad)).toEqual([
      'videos/user-journey-gkt.webm',
      'videos/user-journey-ipad.webm',
    ]);
    expect((await readdir(join(outDir, 'videos'))).sort()).toEqual([
      'user-journey-gkt.webm',
      'user-journey-ipad.webm',
    ]);
  });

  it('fails before writing anything when a device misses a shot', async () => {
    for (const device of DEVICE_IDS) await writeRaw(device, 'start', '/');
    await writeRaw('gkt', 'pin-eingabe', '/pin');

    await expect(
      buildProductScreenshots({ rawDir, outDir, version: 'test', shots: SHOTS })
    ).rejects.toThrow(/ipad.*pin-eingabe/);
    await expect(readdir(outDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a raw image that does not have the device resolution', async () => {
    for (const device of DEVICE_IDS) {
      await writeRaw(device, 'start', '/');
      await writeRaw(device, 'pin-eingabe', '/pin');
    }
    await writeFile(
      join(rawDir, 'gkt', 'start.png'),
      await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#fff' } })
        .png()
        .toBuffer()
    );

    await expect(
      buildProductScreenshots({ rawDir, outDir, version: 'test', shots: SHOTS })
    ).rejects.toThrow(/gkt\/start\.png is 1280×800, expected 2560×1600/);
  });

  it('replaces a previous output', async () => {
    for (const device of DEVICE_IDS) {
      await writeRaw(device, 'start', '/');
      await writeRaw(device, 'pin-eingabe', '/pin');
    }
    await mkdir(join(outDir, 'old-shot'), { recursive: true });

    await buildProductScreenshots({ rawDir, outDir, version: 'test', shots: SHOTS });

    expect((await readdir(outDir)).sort()).toEqual(['manifest.json', 'pin-eingabe', 'start']);
  });
});
