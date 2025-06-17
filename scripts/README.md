# PyrePortal Raspberry Pi Deployment Scripts

## Working Scripts

### 1. `build-on-pi.sh`
Builds PyrePortal directly on a Raspberry Pi. This is the recommended approach due to Tauri's dependency on GTK/WebKit libraries.

**Usage:**
```bash
# On your Raspberry Pi:
./build-on-pi.sh
```

### 2. `pi-setup.sh`
Sets up PyrePortal on a new Raspberry Pi after you've created a GitHub release.

**Usage:**
```bash
# On each new Pi:
wget https://raw.githubusercontent.com/moto-nrw/PyrePortal/main/scripts/pi-setup.sh
chmod +x pi-setup.sh
./pi-setup.sh
```

## Why Cross-Compilation Doesn't Work

Cross-compiling Tauri applications from macOS to Raspberry Pi is challenging because:
- Tauri requires GTK and WebKit libraries
- These libraries have complex dependencies that are difficult to satisfy in cross-compilation environments
- The musl-based cross-compilation tools don't include these GUI libraries

## Recommended Workflow

1. Build on your development Raspberry Pi using `build-on-pi.sh`
2. Upload the resulting binary to GitHub Releases
3. Use `pi-setup.sh` on each production Pi to download and configure the application

## Notes

- All removed scripts attempted cross-compilation which doesn't work reliably for Tauri
- GitHub Actions workflow was removed as it faces the same cross-compilation issues
- Building directly on ARM hardware is the most reliable approach