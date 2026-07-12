# Screenshot & Video Tooling

Automated capture of the full PyrePortal user journey (GKT tablet, 1280x800)
via Playwright. Produces marketing-ready PNGs for every screen state plus a
video of the whole flow.

## Output

`screenshots/output/`:

| File                      | Content                                              |
| ------------------------- | ---------------------------------------------------- |
| `01`–`22` PNGs            | Landing, PIN, Home, Armband zuweisen, Team, Aufsicht |
| `23-checkin-modal`        | "Hallo, {Name}!" check-in modal                      |
| `24-checkout-destination` | "Wohin geht {Name}?" checkout question               |
| `25-feedback-prompt`      | "Wie war dein Tag?" smiley feedback                  |
| `26-farewell`             | "Tschüss, {Name}!"                                   |
| `27/28-pickup-query-*`    | Abholzeit prompt + result                            |
| `29-scan-error`           | Error modal (deliberate: unknown wristband)          |
| `30/31` PNGs              | Home with active session, end-session confirm        |
| `user-journey.webm`       | Video recording of the entire run                    |

Convert the video for platforms that need mp4 (requires ffmpeg):

```bash
ffmpeg -i screenshots/output/user-journey.webm -c:v libx264 -pix_fmt yuv420p screenshots/output/user-journey.mp4
```

## Prerequisites

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
pnpm run screenshots                     # everything
pnpm run screenshots -- --grep "23"      # a single step
SCREENSHOT_PIN=9999 pnpm run screenshots # different staff PIN
```

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

Add a step to the serial flow in `capture.spec.ts`: navigate/click, wait for
a text unique to the target state, then `screenshot(page, 'NN-name')`. Keep
waits keyed on visible German UI text, not timeouts.

## Notes

- Screens show live seed data (names, school name). Reseeding changes names.
- Pickup times exist for weekdays only; weekend runs show
  "keine Abholzeit hinterlegt" in step 28 — both are valid product states.
