# Release Checklist

**IMPORTANT**: When the user asks to release, create a release, bump a version, or prepare a build, run `./scripts/check-version.sh` first and verify it passes before proceeding.

## Version Source

`package.json` is the release version source for PyrePortal.

The retired Raspberry Pi/Balena deployment files and Tauri production settings are not release sources anymore. Do not block GKT releases on `Cargo.toml` or `tauri.conf.json` version values. Tauri is retained for local Mac/mock app usage only.

## Validation

```bash
./scripts/check-version.sh
```

The script checks that `package.json` is greater than the latest GitHub release tag.

## Release Steps

1. Bump `package.json` to the new version without the `v` prefix.
2. Run `./scripts/check-version.sh`.
3. Commit the version bump.
4. Push to `development`.
5. Let the GKT deployment workflow build and deploy the staging app.
6. Verify the deployed staging GKT environment.
7. Merge the release PR from `development` into `main`.
8. Let the GKT deployment workflow deploy production and create the GitHub release for the version in `package.json`.
9. Verify the production GKT environment and confirm that the `v<version>` tag and GitHub release target the deployed commit.

The production workflow creates a metadata-only GitHub release with generated notes after a successful deployment. Re-running the workflow for the same commit is idempotent; reusing an existing version for a different commit fails before deployment.

## Rules

- GKT/GKTL is the production deployment path.
- Do not create new Raspberry Pi, Balena, or Tauri production release steps.
- Never commit secrets, API keys, `.env` files, PINs, or credentials. This repo is public.
- The version is exposed to the frontend via the Vite build and shown in the app UI.
