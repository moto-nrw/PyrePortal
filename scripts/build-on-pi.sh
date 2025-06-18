#!/bin/bash
# Script to build PyrePortal directly on Raspberry Pi

set -e

echo "🔨 Building PyrePortal on Raspberry Pi..."

# Check if running on ARM
if [[ $(uname -m) != "aarch64" ]] && [[ $(uname -m) != "armv7l" ]]; then
    echo "❌ Error: This script should be run on a Raspberry Pi"
    exit 1
fi

# Install Rust if not present
if ! command -v cargo &> /dev/null; then
    echo "📦 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Install Node.js if not present
if ! command -v npm &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install Tauri dependencies
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Clone or update the repository
if [ ! -d "PyrePortal" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/moto-nrw/PyrePortal.git
    cd PyrePortal
else
    echo "📥 Updating repository..."
    cd PyrePortal
    git pull
fi

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Build the application
echo "🏗️ Building application..."
npm run tauri build

# Get version
VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)

# Create release package
echo "📦 Creating release package..."
mkdir -p ../releases
cp src-tauri/target/release/pyre-portal ../releases/
cd ../releases
tar -czf pyreportal-${VERSION}-armhf.tar.gz pyre-portal
shasum -a 256 pyreportal-${VERSION}-armhf.tar.gz > pyreportal-${VERSION}-armhf.tar.gz.sha256

echo "✅ Build complete!"
echo "📦 Release package: $(pwd)/pyreportal-${VERSION}-armhf.tar.gz"