#!/bin/bash

echo "Building PyrePortal for Raspberry Pi using Docker..."

# Use Ubuntu 22.04 which has better ARM support
docker run --rm -v $(pwd):/app -w /app ubuntu:22.04 bash -c "
  # Update and install basic tools
  apt-get update
  apt-get install -y curl build-essential
  
  # Install Rust
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source /root/.cargo/env
  
  # Install Node.js 20
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  
  # Enable armhf architecture and update
  dpkg --add-architecture armhf
  echo 'deb [arch=armhf] http://ports.ubuntu.com/ubuntu-ports/ jammy main restricted universe multiverse' > /etc/apt/sources.list.d/armhf.list
  echo 'deb [arch=armhf] http://ports.ubuntu.com/ubuntu-ports/ jammy-updates main restricted universe multiverse' >> /etc/apt/sources.list.d/armhf.list
  apt-get update
  
  # Install build essentials and cross-compilation tools
  apt-get install -y \
    gcc-arm-linux-gnueabihf \
    g++-arm-linux-gnueabihf \
    pkg-config \
    libc6-dev:armhf
  
  # Install all required GTK and related libraries for ARM
  apt-get install -y \
    libgtk-3-0:armhf \
    libgtk-3-dev:armhf \
    libgdk-pixbuf-2.0-0:armhf \
    libgdk-pixbuf2.0-dev:armhf \
    libcairo2:armhf \
    libcairo2-dev:armhf \
    libpango-1.0-0:armhf \
    libpango1.0-dev:armhf \
    libatk1.0-0:armhf \
    libatk1.0-dev:armhf \
    libglib2.0-dev:armhf \
    libsoup-3.0-0:armhf \
    libsoup-3.0-dev:armhf \
    libjavascriptcoregtk-4.1-0:armhf \
    libjavascriptcoregtk-4.1-dev:armhf \
    libwebkit2gtk-4.1-0:armhf \
    libwebkit2gtk-4.1-dev:armhf || true
  
  # Debug: Check if pkg-config files are installed
  echo '=== Checking pkg-config files ==='
  ls -la /usr/lib/arm-linux-gnueabihf/pkgconfig/ | grep -E 'gdk|cairo|pango|soup|webkit' || echo 'No pkg-config files found'
  
  # Try to find where the files actually are
  echo '=== Finding .pc files ==='
  find /usr -name '*.pc' -path '*arm*' | grep -E 'gdk|cairo|pango|soup|webkit' || echo 'No ARM .pc files found'
  
  # Add Rust target for ARM
  source /root/.cargo/env
  rustup target add armv7-unknown-linux-gnueabihf
  
  # Configure pkg-config for cross-compilation
  export PKG_CONFIG_ALLOW_CROSS=1
  export PKG_CONFIG_PATH=/usr/lib/arm-linux-gnueabihf/pkgconfig:/usr/share/pkgconfig
  export PKG_CONFIG_LIBDIR=/usr/lib/arm-linux-gnueabihf/pkgconfig
  
  # Install dependencies and build
  npm install
  source /root/.cargo/env
  npm run tauri build -- --target armv7-unknown-linux-gnueabihf
"

echo "Build complete!"
echo "Binary: src-tauri/target/armv7-unknown-linux-gnueabihf/release/pyreportal"
echo "Debian package: src-tauri/target/armv7-unknown-linux-gnueabihf/release/bundle/deb/pyreportal_0.1.0_armhf.deb"