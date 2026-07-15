# Wedge Target: USB NFC Reader Setup

The `wedge` build target runs PyrePortal on iPads, iPhones and Android tablets
with a wired USB NFC reader in keyboard-emulation mode. The reader enumerates
as a USB keyboard and "types" the tag UID followed by Enter; the adapter in
`src/platform/wedge/index.ts` captures this with a document-level keydown
listener. No driver, SDK or app permission is needed on the tablet.

Verified end-to-end on 2026-07-13 with an ACS ACR1552U-MF on macOS, iPhone and
iPad: tag assignment, check-in and check-out against a local Phoenix backend.

## Hardware

**ACS ACR1552U-MF** (USB NFC Reader IV, USB-C variant), ca. 45–60 EUR.

- Order the **MF variant** (USB-C plug); the M1 variant has USB-A.
- 13.56 MHz only: MIFARE Classic/DESFire/Ultralight, NTAG, ISO 14443 A/B,
  ISO 15693. Confirm the wristbands are 13.56 MHz before a bulk order
  (quick check: scan one with an NFC-capable Android phone and "NXP TagInfo").

## One-time reader configuration

The reader ships in "Only CCID Reader" mode and **types nothing out of the
box**. It must be switched to keyboard mode once; the setting persists inside
the reader. Two ways to do this:

### Option A: macOS (no Windows needed)

The official ACS configuration tool is Windows-only, but the configuration is
just three PC/SC escape commands, scripted in `scripts/configure-acr1552u.py`.
Apple's built-in CCID driver blocks escape commands, so a one-time driver
setup is needed on the configuring Mac:

1. Build the open [CCID driver](https://github.com/LudovicRousseau/CCID)
   (meson build, static libusb) and install the resulting `ifd-ccid.bundle`:

   ```bash
   sudo mkdir -p /usr/local/libexec/SmartCardServices/drivers
   sudo cp -R ifd-ccid.bundle /usr/local/libexec/SmartCardServices/drivers/
   ```

   In the bundle's `Contents/Info.plist`, set `ifdDriverOptions` to `0x0001`
   (allows CCID escape commands).

2. Switch macOS to the external driver and **reboot** (the smart card daemons
   only read this preference at startup, and SIP blocks restarting them):

   ```bash
   sudo defaults write /Library/Preferences/com.apple.security.smartcard useIFDCCID -bool yes
   ```

   The external driver is active when the reader lists as `...Reader(1)`.

3. Configure the reader:

   ```bash
   python3 -m venv venv && ./venv/bin/pip install pyscard
   ./venv/bin/python scripts/configure-acr1552u.py --dry-run   # read settings
   ./venv/bin/python scripts/configure-acr1552u.py             # write config
   ```

4. Optional: switch the Mac back to the Apple driver afterwards:

   ```bash
   sudo defaults write /Library/Preferences/com.apple.security.smartcard useIFDCCID -bool no
   ```

The script writes: hex output, no separator between bytes, Enter suffix,
normal byte order, host interface "HID Keyboard + CCID" (mode `02`). Mode `02`
keeps the reader reconfigurable over USB (e.g. flipping byte order later) and
works on iPad and iPhone; "Only HID Keyboard" (`00`) would make further USB
configuration impossible without the Windows tool.

### Option B: Windows

Use the official "ACR15XX Series Keyboard Configuration Tool" from the
[ACS product page](https://www.acs.com.hk/en/products/575/acr1552u-usb-nfc-reader-iv/),
following the [NFC-Tag-Shop tutorial](https://www.nfc-tag-shop.de/info/en/tutorials/configuring-the-acs1552u-reader-as-a-uid-scanner/):
host interface "HID Keyboard + CCID Reader", hex output, Enter suffix.

### Verifying a configured reader

Open any text editor, place a tag on the reader. It should type the UID as
hex (e.g. `9a220e01`) followed by Enter. Letter case and separators do not
matter; `normalizeWedgeUid()` normalizes to the GKT tag format
(`9A:22:0E:01`). macOS may open its "Keyboard Setup Assistant" on first
plug-in; just close it. iPadOS has no such dialog.

## Local testing

On the Mac (backend from `../project-phoenix`, `docker compose up -d server`):

```bash
pnpm run dev:wedge
# open http://localhost:1420/?key=<device-api-key>
```

From an iPad/iPhone on the same network, the dev server must listen on the
LAN and point the API at the Mac's IP:

```bash
BUILD_TARGET=wedge VITE_API_BASE_URL=http://<mac-ip>:8080 pnpm exec vite --host
# on the tablet: http://<mac-ip>:1420/?key=<device-api-key>
```

Notes:

- The device API key comes from the `?key=` URL parameter, exactly like GKT.
- Plain-HTTP pages reached via a LAN IP are not a browser "secure context";
  APIs like `crypto.randomUUID` do not exist there. Keep this in mind when
  adding dependencies on Web APIs (the logger already has a fallback).
- With a reader attached, iPadOS hides the on-screen keyboard (a hardware
  keyboard is present). The PIN pad is a touch UI and is unaffected.
- No text field needs focus; the adapter listens on the document. The page
  must be in the foreground.

## Production deployment

`pnpm run build:wedge` produces the production bundle (bakes in
`VITE_API_BASE_URL=https://api.moto-app.de`). Hosting is **not set up yet**:
the wedge build needs its own delivery URL on the same infrastructure as the
GKT build (`deploy-gkt.yml` rsyncs to `/var/www/pyreportal[-staging]`; the
wedge build needs an analogous directory and workflow step). Devices are then
pointed at `https://<wedge-url>/?key=<device-api-key>`.

## Rollout checklist

- [ ] Confirm wristband frequency is 13.56 MHz (NXP TagInfo quick check).
- [ ] Scan the same wristband once via GKT and once via the wedge reader and
      compare the stored tag IDs. If the byte order is reversed, set
      `OUTPUT_FORMAT = [0x30, 0x01]` in `scripts/configure-acr1552u.py` and
      re-run it (works over USB thanks to mode `02`).
- [ ] Decide and set up the wedge hosting path (see above).
- [ ] Walk through the full kiosk flow on the target tablet once, including
      PIN login with the reader attached.
