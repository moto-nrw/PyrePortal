import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import sharp from 'sharp';

import { DEVICE_IDS, DEVICES, type DeviceId } from './devices';
import { BEZEL_DIR, frameMockup, webpVariants } from './frame';
import { CAPTURED_FILE, type CapturedShots, type Shot } from './shots';

// Turns the raw captures of capture.spec.ts into the release asset: per shot
// and device the raw image and the framed mockup, each as PNG and WebP sizes,
// plus manifest.json in the format of project-phoenix's product screenshots.
// A missing or wrong raw image throws before anything is written.

export const MANIFEST_FILE = 'manifest.json';
const MANIFEST_FORMAT = 'moto-product-screenshots/v1';
const VIDEO_FILE = 'user-journey.webm';

interface ManifestFile {
  /** Path relative to the output directory. */
  readonly pfad: string;
  readonly art: 'roh' | 'mockup';
  readonly geraet: DeviceId;
  readonly format: 'png' | 'webp';
  readonly breite: number;
  readonly hoehe: number;
  readonly bytes: number;
  /** WebP only: the target width is larger than the original. */
  readonly hochskaliert?: boolean;
}

interface ManifestShot {
  readonly id: string;
  readonly titel: string;
  readonly portal: 'kiosk';
  readonly rolle: 'betreuer';
  readonly pfad: string;
  readonly dateien: readonly ManifestFile[];
}

interface ManifestVideo {
  readonly pfad: string;
  readonly geraet: DeviceId;
  readonly bytes: number;
}

export interface Manifest {
  readonly format: typeof MANIFEST_FORMAT;
  readonly version: string;
  /** When the images were taken. */
  readonly zeitpunkt: string;
  readonly shots: readonly ManifestShot[];
  readonly videos: readonly ManifestVideo[];
}

export interface ProductOptions {
  /** Contains one directory per device with `<shot id>.png` and captured.json. */
  readonly rawDir: string;
  readonly outDir: string;
  /** Release version; locally any name. */
  readonly version: string;
  readonly shots: readonly Shot[];
  readonly devices?: readonly DeviceId[];
  readonly now?: Date;
  readonly bezelDir?: string;
  readonly log?: (message: string) => void;
}

interface StagedFile {
  readonly entry: ManifestFile;
  readonly data: Buffer;
}

async function stageImage(
  shotId: string,
  art: ManifestFile['art'],
  geraet: DeviceId,
  png: Buffer
): Promise<StagedFile[]> {
  const meta = await sharp(png).metadata();
  const prefix = art === 'roh' ? 'roh-' : '';
  const files: StagedFile[] = [
    {
      entry: {
        pfad: `${shotId}/${prefix}${geraet}.png`,
        art,
        geraet,
        format: 'png',
        breite: meta.width ?? 0,
        hoehe: meta.height ?? 0,
        bytes: png.length,
      },
      data: png,
    },
  ];
  for (const variant of await webpVariants(png)) {
    files.push({
      entry: {
        pfad: `${shotId}/${prefix}${geraet}-${variant.width}.webp`,
        art,
        geraet,
        format: 'webp',
        breite: variant.width,
        hoehe: variant.height,
        bytes: variant.data.length,
        hochskaliert: variant.upscaled,
      },
      data: variant.data,
    });
  }
  return files;
}

async function readCaptured(rawDir: string, device: DeviceId): Promise<CapturedShots> {
  try {
    return JSON.parse(await readFile(join(rawDir, device, CAPTURED_FILE), 'utf8')) as CapturedShots;
  } catch (error) {
    throw new Error(
      `No capture for device ${device} in ${rawDir}. Run the ${device} project first.`,
      {
        cause: error,
      }
    );
  }
}

/** Reads and checks every raw image before any framing starts. */
async function loadRaws(options: ProductOptions, devices: readonly DeviceId[]) {
  const raws: { shot: Shot; device: DeviceId; png: Buffer; pfad: string }[] = [];
  const missing: string[] = [];
  for (const device of devices) {
    const captured = await readCaptured(options.rawDir, device);
    const { viewport, deviceScaleFactor } = DEVICES[device];
    const expected = `${viewport.width * deviceScaleFactor}×${viewport.height * deviceScaleFactor}`;
    for (const shot of options.shots) {
      const file = join(options.rawDir, device, `${shot.id}.png`);
      const png = await readFile(file).catch(() => undefined);
      const pfad = captured[shot.id]?.pfad;
      if (!png || pfad === undefined) {
        missing.push(`${device}/${shot.id}`);
        continue;
      }
      const meta = await sharp(png).metadata();
      const size = `${meta.width}×${meta.height}`;
      if (size !== expected) {
        throw new Error(`${device}/${shot.id}.png is ${size}, expected ${expected}.`);
      }
      raws.push({ shot, device, png, pfad });
    }
  }
  if (missing.length > 0) {
    throw new Error(`Raw captures missing: ${missing.join(', ')}.`);
  }
  return raws;
}

async function fileSize(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size;
  } catch {
    return undefined;
  }
}

export async function buildProductScreenshots(options: ProductOptions): Promise<Manifest> {
  const log = options.log ?? (() => undefined);
  const devices = options.devices ?? DEVICE_IDS;
  const raws = await loadRaws(options, devices);

  const staged = new Map<string, StagedFile[]>(options.shots.map(shot => [shot.id, []]));
  for (const raw of raws) {
    log(`Framing ${raw.shot.id} on ${raw.device}`);
    const mockup = await frameMockup(raw.png, DEVICES[raw.device], options.bezelDir ?? BEZEL_DIR);
    staged
      .get(raw.shot.id)
      ?.push(
        ...(await stageImage(raw.shot.id, 'roh', raw.device, raw.png)),
        ...(await stageImage(raw.shot.id, 'mockup', raw.device, mockup))
      );
  }

  // Write next to the target first, then swap: an abort while writing leaves
  // the previous output untouched.
  const tmpDir = join(dirname(options.outDir), `.${basename(options.outDir)}.tmp-${randomUUID()}`);
  try {
    for (const files of staged.values()) {
      for (const file of files) {
        const target = join(tmpDir, file.entry.pfad);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.data);
      }
    }

    const videos: ManifestVideo[] = [];
    for (const device of devices) {
      const source = join(options.rawDir, device, VIDEO_FILE);
      const bytes = await fileSize(source);
      if (bytes === undefined) continue;
      const pfad = `videos/user-journey-${device}.webm`;
      await mkdir(join(tmpDir, 'videos'), { recursive: true });
      await copyFile(source, join(tmpDir, pfad));
      videos.push({ pfad, geraet: device, bytes });
    }

    const firstPath = new Map<string, string>();
    for (const raw of raws) if (!firstPath.has(raw.shot.id)) firstPath.set(raw.shot.id, raw.pfad);
    const manifest: Manifest = {
      format: MANIFEST_FORMAT,
      version: options.version,
      zeitpunkt: (options.now ?? new Date()).toISOString(),
      shots: options.shots.map(shot => ({
        id: shot.id,
        titel: shot.titel,
        portal: 'kiosk',
        rolle: 'betreuer',
        pfad: firstPath.get(shot.id) ?? '',
        dateien: (staged.get(shot.id) ?? []).map(file => file.entry),
      })),
      videos,
    };
    await writeFile(join(tmpDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

    await rm(options.outDir, { recursive: true, force: true });
    await rename(tmpDir, options.outDir);
    log(`Output: ${options.outDir}`);
    return manifest;
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}
