# Unified kiosk deployment

One production `dist/` serves GKT/GKTL and keyboard-wedge devices at the existing
kiosk URL. This is one deployment per environment, not one environment: staging
and production retain separate API URLs and directories.

## Runtime selection

- The native WebView supplies `GKTKiosk`: select GKT.
- Without that bridge: select Wedge.
- No device setting, query override or selection screen is needed.
- `system.js` loads synchronously before the app. `SYSTEM.registerNfc` alone
  cannot identify GKT because the wrapper defines it in ordinary browsers too.
- A detected GKT with a missing or broken wrapper fails NFC initialization. It
  must not silently switch to Wedge.
- `?key=...`, staff authentication and API requests are unchanged. Pairing is
  tracked separately in [#425](https://github.com/moto-nrw/PyrePortal/issues/425).

`pnpm run dev` retains the browser mock. `pnpm run dev:kiosk` exercises automatic
selection against localhost; `BUILD_TARGET=gkt pnpm run dev` forces the GKT path
for local callback simulation. These development options do not affect production:
`pnpm run build`, `build:gkt` and `build:wedge` all build the same kiosk entry point.

## CI and server

The existing workflow filenames and job IDs remain for compatibility with callers
and required checks. `build-gkt.yml` now tests the application and builds both
adapters together. `deploy-gkt.yml` waits for lint, type, formatting and dead-code
checks, then runs tests and builds the environment-specific bundle before release
preparation or SSH deployment.

Existing configuration remains valid:

| Branch        | API variable          | Server directory              |
| ------------- | --------------------- | ----------------------------- |
| `development` | `GKT_STAGING_API_URL` | `/var/www/pyreportal-staging` |
| `main`        | `GKT_PROD_API_URL`    | `/var/www/pyreportal`         |

`DEPLOY_HOST` and `DEPLOY_SSH_KEY` remain unchanged. No backend endpoint, database
migration, extra domain or Wedge virtual host is required. Keep the existing web
root and TLS configuration. Verify that `/system.js` is served as JavaScript and
that `index.html` is revalidated so kiosks receive new releases. The live server
configuration must be checked during rollout; it is not stored in this repository.

## Error reporting (Sentry)

Crashes go to the Sentry project `pyreportal` through the backend relay
`POST /api/iot/error-reports` (SDK option `tunnel`, device key as
`Authorization` header). The relay adds `device_id` and `school_id`; the kiosk
sets only the tag `platform`. Code: `src/services/errorReporting.ts`.

- Without `VITE_SENTRY_DSN` in the build, Sentry does not start. Local builds
  and the CI check builds have none.
- The `key` query parameter is removed from the request URL, the Referer and
  breadcrumb URLs. Console breadcrumbs are off because `system.js` logs
  wristband UIDs. There is no trace propagation.
- Errors while offline wait in IndexedDB (up to 30 envelopes) and are sent
  after reconnecting. Without IndexedDB the kiosk runs without a buffer.
- Release `pyreportal@<version>+<short SHA>`, environment from `DEPLOY_ENV`.
- The relay's error texts are consumed by the SDK transport and never shown,
  so they are not part of `ERROR_MESSAGE_MAPPINGS` (project-phoenix
  `docs/agents/contracts.md`, "Error reports relay").

`deploy-gkt.yml` passes the secrets `VITE_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` and
the variables `SENTRY_ORG` and `SENTRY_PROJECT` to the build. With the token,
the Sentry Vite plugin builds `hidden` source maps and uploads them. The
workflow deletes every `.map` before `rsync` and reports the deploy to Sentry
after a successful `rsync`.

## Rollout and rollback

1. Deploy to staging and cold-start a real GKT/GKTL. Confirm native bridge
   availability at app startup and a successful wristband scan. A browser
   simulation cannot prove WebView injection timing.
2. Open the same staging URL on a tablet with a configured USB reader. Verify PIN
   login, attendance, tag assignment and pickup lookup. Compare UID formatting
   against GKT using the same wristband.
3. Test rapid scans less than one second apart, offline to online recovery and
   reload/session restoration on both devices.
4. Promote the tested change to production only after these hardware checks pass.
   Existing GKT URLs and keys stay unchanged; Wedge uses that same URL with its
   own device key.
5. If hardware validation fails, keep production on the previous build. After a
   production regression, restore the prior known-good `dist/` through the normal
   deployment process, preserving the environment's API URL. Do not repoint
   devices or rotate keys merely to roll back this frontend change.
