# Raspberry Pi 5 Native 64-bit Build Instructions

This guide provides instructions for building PyrePortal natively on Raspberry Pi 5 with 64-bit Raspberry Pi OS (Bookworm) for optimal performance.

## Prerequisites

- Raspberry Pi 5 Model B (4GB+ RAM recommended)
- 64-bit Raspberry Pi OS (Bookworm or later)
- Internet connection
- At least 4GB free disk space

## Build Commands

Run these commands on your Raspberry Pi 5:

```bash
# Install build dependencies
sudo apt update
sudo apt install -y curl git build-essential pkg-config libssl-dev
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Rust (64-bit native)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Clone the repo
git clone https://github.com/moto-nrw/PyrePortal.git
cd PyrePortal

# Install npm dependencies
npm install

# Build natively (will automatically use aarch64)
npm run tauri build

# Set environment and run
export VITE_API_BASE_URL="https://moto-app.de"
export VITE_DEVICE_API_KEY="dev_3236de5e4c4140f273299adbb1bd5d6036bad1a47daab0b0c700201ca0aab6ca"
export VITE_ENABLE_RFID="true"

# Run with performance timing
time ./src-tauri/target/release/pyreportal
```

## Performance Testing

To benchmark the application performance:

```bash
# Basic timing
time ./src-tauri/target/release/pyreportal &

# Memory usage monitoring
PID=$!
sleep 5
ps -p $PID -o %mem,rss,vsz

# Kill after testing
kill $PID
```

## Expected Performance

| Platform    | Expected FPS | Animation Quality        |
| ----------- | ------------ | ------------------------ |
| Pi 4 32-bit | 15-25 FPS    | Stuttery, frame drops    |
| Pi 4 64-bit | 30-45 FPS    | Smooth, occasional drops |
| Pi 5 64-bit | 45-60 FPS    | Very smooth, rare drops  |

## Build Time

- **Expected build time**: 7-15 minutes
- **Peak memory usage**: ~2-3GB during compilation
- **Final binary size**: ~12-15MB

## Troubleshooting

### Build Fails with Memory Issues

```bash
# Add swap space if you have <4GB RAM
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile  # Set CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Missing Dependencies

```bash
# Install additional dependencies if needed
sudo apt install -y libudev-dev
```

### Rust Environment Issues

```bash
# Reload Rust environment
source ~/.cargo/env
rustc --version  # Should show aarch64 target
```

## Configuration

Create a permanent environment setup:

```bash
# Add to ~/.bashrc for persistent environment
echo 'export VITE_API_BASE_URL="https://moto-app.de"' >> ~/.bashrc
echo 'export VITE_DEVICE_API_KEY="dev_3236de5e4c4140f273299adbb1bd5d6036bad1a47daab0b0c700201ca0aab6ca"' >> ~/.bashrc
echo 'export VITE_ENABLE_RFID="true"' >> ~/.bashrc
source ~/.bashrc
```

## Performance Optimization

For maximum performance on Pi 5:

```bash
# GPU memory split (in /boot/firmware/config.txt)
sudo nano /boot/firmware/config.txt
# Add: gpu_mem=128

# CPU governor
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

## Notes

- This builds a native AArch64 (64-bit ARM) binary optimized for Pi 5
- No cross-compilation required - builds directly on the target hardware
- Resulting binary will have better performance than the 32-bit cross-compiled version
- RFID functionality requires appropriate hardware connected via GPIO
