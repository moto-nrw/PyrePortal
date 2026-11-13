# Screenshot & Video Tooling

Automated capture of the full PyrePortal user journey via Playwright, once per
device, framed into marketing-ready product screenshots. Same output format as
the product screenshots of project-phoenix (`moto-product-screenshots/v1`).

## Where the latest screenshots are

Every release `vX.Y.Z` carries the product screenshots as assets:

- `product-screenshots-<version>.zip` — the images of exactly that release.
- `product-screenshots.zip` — the same file under a fixed name, so the latest
  release's images are at
  <https://github.com/moto-ogs/PyrePortal/releases/latest/download/product-screenshots.zip>.
  The capture takes about 15 minutes after the release is created; until then,
  or if that run failed, the link answers 404 and the files are on the previous
  release.

`.github/workflows/product-screenshots.yml` creates them. After the production
deploy created a new release, `deploy-gkt.yml` starts it as its own run on the
tag `vX.Y.Z`, so it neither holds up the next deploy nor turns the deploy red.
A manual run (Actions, "Product screenshots", Run workflow on `main` or a tag
`vX.Y.Z`) replaces the assets of that release; use it after a failed run. Pull requests that change the tooling run
it once as a test, without attaching anything. The backend in CI is the newest
release of project-phoenix, seeded with `--product-screenshots`; the VM clock
is set to the last Tuesday, 10:00 Berlin.

## Devices

| Device | Viewport (CSS px) | Scale | Raw image | Frame                                |
| ------ | ----------------- | ----- | --------- | ------------------------------------ |
| `gkt`  | 1280×800          | 2     | 2560×1600 | GKT kiosk with NFC reader            |
| `ipad` | 1210×834          | 2     | 2420×1668 | iPad Pro 11" landscape (Wedge kiosk) |

Devices and screen rectangles live in `devices.ts`, the frames in `bezels/`
(see `bezels/README.md`).

## Output

Raw captures: `screenshots/output/raw/<device>/<shot id>.png`, plus
`captured.json` (route per shot) and `user-journey.webm`.

Product screenshots: `screenshots/output/product/` (CI: the release ZIP):

| Path                                | Content                                            |
| ----------------------------------- | -------------------------------------------------- |
| `<shot id>/roh-<device>.png`        | raw image in device resolution                     |
| `<shot id>/<device>.png`            | mockup in the device frame, transparent background |
| `<shot id>/[roh-]<device>-<w>.webp` | both as WebP, w = 640/960/1280/1600/2400/3200      |
| `videos/user-journey-<device>.webm` | video of the whole run per device                  |
| `manifest.json`                     | version, time, shots with title, route and files   |

The shot list with IDs and titles is `shots.ts`; IDs stay the same across
releases. WebP widths above the source width are upscaled and marked
`hochskaliert` in the manifest (the GKT mockup is 1688 px wide).

Convert a video for platforms that need mp4 (requires ffmpeg):

```bash
ffmpeg -i user-journey-gkt.webm -c:v libx264 -pix_fmt yuv420p user-journey-gkt.mp4
```

## Browser

Playwright launches the system **Google Chrome** (`channel: 'chrome'`) with
the Chromium sandbox enabled. It does not use or download its own bundled
Chromium: the one shipped with Playwright 1.64.1 (156.0.8078.4) has known
critical vulnerabilities, and Playwright turns the sandbox off by default.
The options live in `secure-chrome.ts`.

Before any test, `global-setup.ts` starts Chrome once and stops the run if its
version is below `MIN_CHROME_VERSION` (156.0.8078.73). Update Chrome when that
happens:

- macOS/Windows: keep a regular Google Chrome installation up to date.
- Linux and CI: `pnpm exec playwright install --with-deps chrome` installs
  the current stable Chrome to `/opt/google/chrome` (needs sudo).

`pnpm exec playwright install chromium` is no longer needed. This is an
interim measure until a Playwright release bundles a patched Chromium
(moto-ogs/PyrePortal#496, moto-ogs/project-phoenix#5612).

## Prerequisites

Google Chrome 156.0.8078.73 or newer must be installed (see [Browser](#browser)).

1. **Local backend** (project-phoenix) on `http://localhost:8080` with demo
   seed data:

   ```bash
   cd ../project-phoenix
   docker compose up -d
   docker compose run server go run . migrate
   # seed command printed by scripts/setup-dev.sh; creates staff (PIN 1234),
   # 100 students and IoT device keys, written to backend/.seed-state.json
   ```

2. **`.env` in the PyrePortal repo root** (gitignored — never commit keys):

   ```bash
   VITE_API_BASE_URL=http://localhost:8080
   VITE_DEVICE_API_KEY=<api_key of a device from backend/.seed-state.json>
   ```

3. **Tenant settings for the checkout/feedback flow** (steps 24-26). The
   "nach Hause" button and the feedback prompt are opt-in tenant settings;
   without them the checkout scan shows no destination buttons. Enable them
   once per seeded database:

   ```sql
   INSERT INTO config.setting_values (tenant_id, setting_key, value)
   SELECT t.id, s.key, s.val::jsonb
   FROM platform.schools t,
        (VALUES ('feedback.enabled','true'),
                ('operations.student_daily_checkout_time','"00:01"')) AS s(key,val)
   ON CONFLICT (tenant_id, setting_key) DO UPDATE SET value = EXCLUDED.value;
   ```

   (`00:01` opens the daily-checkout time gate for the whole day, so
   screenshot runs work at any time; the production default is 15:00.)

4. **Port 1420 free.** Playwright always starts its own dev server so that
   the deterministic mock-tag pin (below) is guaranteed to apply. Stop any
   running `pnpm run dev` first.

## Run

```bash
pnpm run screenshots:product                     # both devices, then framing
pnpm run screenshots --project=gkt            # raw images of one device
pnpm run screenshots --project=rfid-parity    # RFID parity check, no backend
SCREENSHOT_PIN=9999 pnpm run screenshots:product # different staff PIN
pnpm exec vitest run screenshots/                # framing and manifest tests
```

`SHOT_OUT` and `SHOT_VERSION` set output directory and manifest version
(defaults: `screenshots/output/product`, `package.json`). The backend must
allow the dev server's origin: `ENABLE_CORS=true` and
`CORS_ALLOWED_ORIGINS=http://localhost:1420`.

## How determinism works

Random scans produced wrong captures in the past (e.g. an error modal saved
as "check-in modal"). Two mechanisms prevent that:

- `playwright.config.ts` pins `VITE_MOCK_RFID_TAGS` to the single tag in
  `screenshots/tags.ts`. Step 10 assigns exactly that tag to a student, so
  later scans of it are always valid check-ins/checkouts.
- On the scanning page the spec injects scans via the dev-only
  `window.__PYREPORTAL_MOCK_SCAN__(tagId)` hook (`src/dev/mockScanSource.ts`)
  and disables the random auto-scan interval via
  `window.__PYREPORTAL_DISABLE_AUTOSCAN__`. Both hooks exist only in dev
  builds (`import.meta.env.DEV`).

Short-lived modals (check-in 1.5s, farewell 1.5s) are captured with a short
settle delay — see the `settleMs` parameter of `screenshot()`.

## Adding a new capture

Add the shot to `shots.ts` (ID and title, in journey order), then a step to
the serial flow in `capture.spec.ts`: navigate/click, wait for a text unique
to the target state, then `screenshot(page, '<shot id>')`. Keep waits keyed on
visible German UI text, not timeouts. A listed shot that a device did not
capture fails the `product` project before anything is written.

## Notes

- Screens show live seed data (names, school name). Reseeding changes names.
- Pickup times exist for weekdays only; weekend runs show
  "keine Abholzeit hinterlegt" in step 28 — both are valid product states.
