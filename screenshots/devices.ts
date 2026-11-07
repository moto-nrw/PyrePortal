// Devices of the product screenshots. Same layout as project-phoenix
// frontend/scripts/product-screenshots/devices.ts: the native viewport and
// deviceScaleFactor give the raw image the real display pixels; the bezel and
// its screen rectangle frame it.

export const DEVICE_IDS = ['gkt', 'ipad'] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface DeviceSpec {
  readonly id: DeviceId;
  readonly label: string;
  /** CSS pixels of the viewport. */
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly hasTouch: boolean;
  readonly bezel: {
    /** File name in ./bezels. */
    readonly file: string;
    /** Expected size of the bezel image; a different image aborts the run. */
    readonly width: number;
    readonly height: number;
    /** Transparent screen area inside the bezel image. */
    readonly screen: Rect;
  };
}

export const DEVICES: Readonly<Record<DeviceId, DeviceSpec>> = {
  // GKT/GKTL kiosk: 10.1" 16:10 display, 1280×800 CSS pixels.
  gkt: {
    id: 'gkt',
    label: 'GKT-Kiosk mit NFC-Leser',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
    bezel: {
      file: 'gkt-tablet.png',
      width: 1688,
      height: 1390,
      screen: { left: 109, top: 113, width: 1472, height: 908 },
    },
  },
  // Wedge kiosk on an iPad Pro 11" in landscape: 2420×1668 px. Bezel and
  // screen rectangle are the ones project-phoenix uses for its `ipad` device.
  ipad: {
    id: 'ipad',
    label: 'iPad Pro 11" quer',
    viewport: { width: 1210, height: 834 },
    deviceScaleFactor: 2,
    hasTouch: true,
    bezel: {
      file: 'ipad-pro-11-quer.png',
      width: 2640,
      height: 1880,
      screen: { left: 110, top: 106, width: 2420, height: 1668 },
    },
  },
};
