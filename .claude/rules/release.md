# Release Checklist

## Pre-Release: Version Sync (MANDATORY)

Before every release, the version in these 3 files **MUST** match the new release tag:

| File                        | Field       |
| --------------------------- | ----------- |
| `package.json`              | `"version"` |
| `src-tauri/Cargo.toml`      | `version`   |
| `src-tauri/tauri.conf.json` | `"version"` |

### Validation (always run before a release)

```bash
# Latest GitHub release tag
gh release list --limit 1

# Current version in branch
node -p "require('./package.json').version"
grep '^version' src-tauri/Cargo.toml
grep '"version"' src-tauri/tauri.conf.json
```

All three files must show the **same version**, and it must be **greater than** the latest GitHub tag.

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
