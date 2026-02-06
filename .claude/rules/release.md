# Release Checklist

**IMPORTANT**: When the user asks to release, create a release, bump a version, or prepare a build — you MUST run `./scripts/check-version.sh` FIRST and verify it passes before proceeding with any release step.

## Pre-Release: Version Sync (MANDATORY)

Before every release, the version in these 3 files **MUST** match the new release tag:

| File                        | Field       |
| --------------------------- | ----------- |
| `package.json`              | `"version"` |
| `src-tauri/Cargo.toml`      | `version`   |
| `src-tauri/tauri.conf.json` | `"version"` |

### Validation (ALWAYS run before a release)

```bash
./scripts/check-version.sh
```

This script checks that all 3 files match and the version is greater than the latest GitHub release tag. **It MUST pass before building.** If it fails, fix the versions first.

### Automated Guard

The `pre-push` hook (`.husky/pre-push`) blocks any push where the 3 version files are out of sync. This catches mistakes automatically but does NOT check against GitHub tags — that requires the manual `check-version.sh` script above.

### Bumping

When releasing e.g. `v1.0.7`:

1. Update all 3 files to `1.0.7` (without `v` prefix)
2. Commit: `git commit -m "chore: bump version to v1.0.7"`
3. Push to `development` before building on Pi

## Release Steps

1. **Bump version and push** (Mac) — update 3 files, commit, push to `development`
2. **Build on Pi** — `ssh`, `git pull`, `npm install`, `npm run tauri build -- --features rfid`
3. **Download binary** (Mac) — `scp` from Pi to `~/Desktop/pyreportal-arm64-vX.Y.Z`
4. **Create GitHub release** (Mac) — `gh release create vX.Y.Z ...` with binary attached
5. **Verify Balena update** — Balena pulls new binary on next container start

## Rules

- **Never** use `cargo build` alone for releases. Always `npm run tauri build` (bundles Frontend + Backend).
- **Never** commit secrets, API keys, `.env` files, PINs, or credentials. This repo is public.
- The version is baked into the binary at compile time and displayed on the Landing Page. If you skip the version bump, the app shows the wrong version.
