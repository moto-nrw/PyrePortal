# Raspberry Pi Deployment Guide for PyrePortal

This comprehensive guide covers everything you need to deploy PyrePortal as a production kiosk application on Raspberry Pi devices with automatic startup, proper environment configuration, and fleet management capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Cross-Compilation Setup](#cross-compilation-setup)
4. [Environment Variables Strategy](#environment-variables-strategy)
5. [Systemd Service Configuration](#systemd-service-configuration)
6. [Deployment Automation](#deployment-automation)
7. [Installation Scripts](#installation-scripts)
8. [Configuration Management](#configuration-management)
9. [Update Strategy](#update-strategy)
10. [Troubleshooting](#troubleshooting)
11. [Security Considerations](#security-considerations)

## Overview

PyrePortal deployment on Raspberry Pi involves several key components:

- **Cross-compilation**: Building ARM64 binaries from your development machine
- **Environment management**: Handling API keys and configuration securely
- **Auto-startup**: Using systemd services for reliable application launching
- **Fleet management**: Deploying and configuring multiple devices efficiently
- **Update mechanism**: Streamlined process for application updates

### Why This Approach?

1. **Security**: Environment variables are managed at the system level, not bundled in the application
2. **Reliability**: Systemd ensures the application restarts automatically on failure
3. **Scalability**: Scripts support managing multiple Pi devices from a central location
4. **Maintainability**: Clear separation between application code and deployment configuration

## Prerequisites

### Development Machine Requirements

```bash
# Install Rust cross-compilation target
rustup target add aarch64-unknown-linux-gnu

# Install ARM cross-compiler (Ubuntu/Debian)
sudo apt install gcc-aarch64-linux-gnu

# Or on macOS with Homebrew
brew install aarch64-unknown-linux-gnu
```

### Raspberry Pi Requirements

- Raspberry Pi 4 (recommended) or Pi 3B+ with ARM64 OS
- Raspberry Pi OS 64-bit (Bullseye or newer)
- Network connectivity
- SSH access enabled
- At least 4GB SD card with 2GB free space

### Network Setup

Ensure all Raspberry Pi devices:
- Have static IP addresses or consistent DHCP reservations
- Can access your production API endpoints
- Allow SSH connections from your deployment machine

## Cross-Compilation Setup

### Method 1: Manual Cross-Compilation (Recommended)

Cross-compilation allows you to build ARM binaries on your development machine, avoiding the performance limitations of compiling directly on the Pi.

#### 1. Configure Cargo for Cross-Compilation

Create or update `.cargo/config.toml` in your project root:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"

[build]
# Optional: Set default target for this project
# target = "aarch64-unknown-linux-gnu"
```

#### 2. Update Tauri Configuration

Modify `src-tauri/tauri.conf.json` to optimize for kiosk deployment:

```json
{
  "bundle": {
    "active": true,
    "targets": ["deb"],
    "deb": {
      "depends": [
        "libwebkit2gtk-4.0-37",
        "libgtk-3-0",
        "libayatana-appindicator3-1"
      ]
    }
  },
  "app": {
    "windows": [
      {
        "title": "PyrePortal",
        "resizable": false,
        "fullscreen": true,
        "center": true,
        "decorations": false,
        "alwaysOnTop": true
      }
    ]
  }
}
```

#### 3. Build Command

```bash
# Build for Raspberry Pi ARM64
npm run tauri build -- --target aarch64-unknown-linux-gnu

# The resulting .deb file will be in:
# src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/
```

### Method 2: Docker-Based Cross-Compilation

For consistent build environments, especially in CI/CD pipelines:

Create `Dockerfile.pi-build`:

```dockerfile
FROM debian:bullseye-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    gcc-aarch64-linux-gnu \
    pkg-config \
    libssl-dev \
    libwebkit2gtk-4.0-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add aarch64-unknown-linux-gnu

WORKDIR /app
COPY . .

# Configure cross-compilation
RUN echo '[target.aarch64-unknown-linux-gnu]\nlinker = "aarch64-linux-gnu-gcc"' > .cargo/config.toml

# Build
RUN npm install
RUN npm run tauri build -- --target aarch64-unknown-linux-gnu
```

Build with Docker:

```bash
docker build -f Dockerfile.pi-build -t pyreportal-pi-builder .
docker run --rm -v $(pwd)/dist:/app/dist pyreportal-pi-builder
```

## Environment Variables Strategy

### Production Environment Variables

Environment variables are managed at the system level to ensure security and proper separation of concerns.

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Production API endpoint | `https://api.yourschool.edu` |
| `VITE_DEVICE_API_KEY` | Device-specific API key | `prod_abc123...` |
| `VITE_APP_VERSION` | Application version | `1.0.0` |
| `DEVICE_ID` | Unique device identifier | `classroom_a_pi01` |
| `LOCATION` | Physical location | `Building A - Room 101` |

#### System-Level Configuration

Environment variables are stored in `/etc/environment` on each Pi:

```bash
# /etc/environment
VITE_API_BASE_URL=https://api.yourschool.edu
VITE_DEVICE_API_KEY=prod_your_actual_api_key_here
VITE_APP_VERSION=1.0.0
DEVICE_ID=classroom_a_pi01
LOCATION=Building A - Room 101
```

#### Security Best Practices

1. **Never commit real API keys** to version control
2. **Use device-specific keys** when possible
3. **Rotate keys periodically** using your update scripts
4. **Monitor API usage** for unauthorized access
5. **Use HTTPS** for all API communications

### Environment Variable Access in Code

Since you're using Vite with the `VITE_` prefix, these variables are available in your frontend code:

```typescript
// src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEVICE_API_KEY = import.meta.env.VITE_DEVICE_API_KEY;

export const apiClient = {
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${DEVICE_API_KEY}`,
    'Content-Type': 'application/json'
  }
};
```

## Systemd Service Configuration

Systemd ensures your application starts automatically on boot and restarts on failure.

### Service File Explanation

Create `/etc/systemd/system/pyreportal.service`:

```ini
[Unit]
Description=PyrePortal Kiosk Application
After=graphical.target network-online.target
Wants=graphical.target
Requires=network-online.target

[Service]
Type=simple
User=pi
Group=pi
Environment=DISPLAY=:0
EnvironmentFile=/etc/environment
ExecStartPre=/bin/sleep 10
ExecStart=/opt/pyreportal/pyreportal
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
TimeoutStartSec=30

[Install]
WantedBy=graphical.target
```

#### Service Configuration Details

- **`After=graphical.target network-online.target`**: Ensures GUI and network are ready
- **`Wants=graphical.target`**: Starts after the graphical interface
- **`User=pi`**: Runs as the pi user (important for display access)
- **`Environment=DISPLAY=:0`**: Sets the display for GUI applications
- **`EnvironmentFile=/etc/environment`**: Loads environment variables
- **`ExecStartPre=/bin/sleep 10`**: Waits for system to fully initialize
- **`Restart=always`**: Automatically restarts on failure
- **`RestartSec=10`**: Waits 10 seconds before restart attempts

### Service Management Commands

```bash
# Enable service (start on boot)
sudo systemctl enable pyreportal

# Start service immediately
sudo systemctl start pyreportal

# Check service status
sudo systemctl status pyreportal

# View logs
sudo journalctl -u pyreportal -f

# Restart service
sudo systemctl restart pyreportal

# Stop service
sudo systemctl stop pyreportal

# Disable service (prevent auto-start)
sudo systemctl disable pyreportal
```

## Deployment Automation

### Main Deployment Script

Create `deploy-to-pi.sh` in your project root:

```bash
#!/bin/bash
set -e

# Configuration
PI_HOST="$1"
PI_USER="${PI_USER:-pi}"
APP_NAME="pyreportal"
BUILD_TARGET="aarch64-unknown-linux-gnu"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Validate input
if [ -z "$PI_HOST" ]; then
    error "Usage: $0 <pi-ip-address> [device-id] [location]"
    echo "Example: $0 192.168.1.100 classroom_a_pi01 'Building A - Room 101'"
    exit 1
fi

# Optional parameters
DEVICE_ID="${2:-${PI_HOST##*.}_pi}"
LOCATION="${3:-Classroom ${PI_HOST##*.}}"

log "Starting deployment to Pi at $PI_HOST"
log "Device ID: $DEVICE_ID"
log "Location: $LOCATION"

# Check if Pi is reachable
if ! ping -c 1 -W 5 "$PI_HOST" >/dev/null 2>&1; then
    error "Cannot reach Pi at $PI_HOST"
    exit 1
fi

# Check SSH connectivity
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "${PI_USER}@${PI_HOST}" exit 2>/dev/null; then
    error "Cannot SSH to ${PI_USER}@${PI_HOST}"
    echo "Ensure SSH keys are set up or use: ssh-copy-id ${PI_USER}@${PI_HOST}"
    exit 1
fi

log "Building application for Raspberry Pi..."

# Clean previous build
npm run clean:target 2>/dev/null || true

# Build for ARM64
if ! npm run tauri build -- --target $BUILD_TARGET; then
    error "Build failed!"
    exit 1
fi

# Find the built .deb file
BUILD_DIR="src-tauri/target/${BUILD_TARGET}/release/bundle/deb"
DEB_FILE=$(find "$BUILD_DIR" -name "*.deb" -type f | head -1)

if [ -z "$DEB_FILE" ] || [ ! -f "$DEB_FILE" ]; then
    error "No .deb file found in $BUILD_DIR"
    exit 1
fi

DEB_FILENAME=$(basename "$DEB_FILE")
success "Built: $DEB_FILENAME"

# Prepare deployment files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

cp "$DEB_FILE" "$TEMP_DIR/"
cp "deploy/install-on-pi.sh" "$TEMP_DIR/"

# Create device-specific configuration
cat > "$TEMP_DIR/device-config.env" << EOF
DEVICE_ID=$DEVICE_ID
LOCATION=$LOCATION
VITE_API_BASE_URL=\${VITE_API_BASE_URL:-https://api.yourschool.edu}
VITE_DEVICE_API_KEY=\${VITE_DEVICE_API_KEY:-SET_THIS_VALUE}
VITE_APP_VERSION=\${VITE_APP_VERSION:-1.0.0}
EOF

log "Copying files to Pi..."

# Copy files to Pi
if ! scp -q "$TEMP_DIR"/* "${PI_USER}@${PI_HOST}:/tmp/"; then
    error "Failed to copy files to Pi"
    exit 1
fi

log "Installing application on Pi..."

# Install on Pi
if ssh "${PI_USER}@${PI_HOST}" "chmod +x /tmp/install-on-pi.sh && sudo /tmp/install-on-pi.sh"; then
    success "Deployment completed successfully!"
    
    # Show service status
    log "Service status:"
    ssh "${PI_USER}@${PI_HOST}" "sudo systemctl status pyreportal --no-pager -l"
    
    success "PyrePortal is now running on http://$PI_HOST"
    log "View logs with: ssh ${PI_USER}@${PI_HOST} 'sudo journalctl -u pyreportal -f'"
else
    error "Installation failed!"
    exit 1
fi
```

Make the script executable:

```bash
chmod +x deploy-to-pi.sh
```

### Usage Examples

```bash
# Basic deployment
./deploy-to-pi.sh 192.168.1.100

# Deployment with custom device ID and location
./deploy-to-pi.sh 192.168.1.100 "classroom_a_pi01" "Building A - Room 101"

# Deploy to multiple Pis
for ip in 192.168.1.{100..105}; do
    ./deploy-to-pi.sh "$ip" "classroom_${ip##*.}_pi" "Classroom ${ip##*.}"
done
```

## Installation Scripts

### Pi Installation Script

Create `deploy/install-on-pi.sh`:

```bash
#!/bin/bash
set -e

# Configuration
APP_NAME="pyreportal"
SERVICE_NAME="pyreportal"
INSTALL_DIR="/opt/pyreportal"
LOG_FILE="/tmp/pyreportal-install.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (use sudo)"
    exit 1
fi

log "Starting PyrePortal installation..."

# Stop existing service if running
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log "Stopping existing service..."
    systemctl stop "$SERVICE_NAME"
fi

# Install the .deb package
log "Installing .deb package..."
DEB_FILE=$(find /tmp -name "*.deb" -type f | head -1)

if [ -z "$DEB_FILE" ]; then
    error "No .deb file found in /tmp"
    exit 1
fi

log "Installing: $(basename "$DEB_FILE")"

# Install package and fix dependencies if needed
if ! dpkg -i "$DEB_FILE"; then
    log "Fixing dependencies..."
    apt-get update
    apt-get install -f -y
fi

# Create application directory
log "Setting up application directory..."
mkdir -p "$INSTALL_DIR"
chown pi:pi "$INSTALL_DIR"

# Find and copy the installed binary
BINARY_PATH=$(which "$APP_NAME" 2>/dev/null || find /usr -name "$APP_NAME" -type f 2>/dev/null | head -1)

if [ -z "$BINARY_PATH" ]; then
    error "Could not find installed binary"
    exit 1
fi

cp "$BINARY_PATH" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/$APP_NAME"

log "Binary installed to: $INSTALL_DIR/$APP_NAME"

# Set up environment variables
log "Configuring environment variables..."

# Load device-specific config if provided
if [ -f "/tmp/device-config.env" ]; then
    log "Loading device-specific configuration..."
    
    # Backup existing environment
    if [ -f "/etc/environment" ]; then
        cp /etc/environment /etc/environment.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    # Merge configurations
    {
        # Keep existing non-PyrePortal variables
        grep -v "^VITE_\|^DEVICE_ID\|^LOCATION" /etc/environment 2>/dev/null || true
        
        # Add new variables, substituting defaults
        while IFS= read -r line; do
            if [[ $line == *"="* ]]; then
                var_name=$(echo "$line" | cut -d'=' -f1)
                var_value=$(echo "$line" | cut -d'=' -f2-)
                
                # Handle variable substitution
                if [[ $var_value == *"\${"* ]]; then
                    # Extract default value
                    default_value=$(echo "$var_value" | sed 's/.*:-\([^}]*\)}.*/\1/')
                    echo "$var_name=$default_value"
                else
                    echo "$line"
                fi
            fi
        done < "/tmp/device-config.env"
    } > /etc/environment.new
    
    mv /etc/environment.new /etc/environment
else
    # Create default environment if none exists
    if [ ! -f "/etc/environment" ]; then
        cat > /etc/environment << 'EOF'
VITE_API_BASE_URL=https://api.yourschool.edu
VITE_DEVICE_API_KEY=SET_THIS_VALUE
VITE_APP_VERSION=1.0.0
DEVICE_ID=default_pi
LOCATION=Default Location
EOF
        warning "Created default environment. Please update /etc/environment with correct values."
    fi
fi

# Install systemd service
log "Installing systemd service..."

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=PyrePortal Kiosk Application
After=graphical.target network-online.target
Wants=graphical.target
Requires=network-online.target

[Service]
Type=simple
User=pi
Group=pi
Environment=DISPLAY=:0
EnvironmentFile=/etc/environment
ExecStartPre=/bin/sleep 10
ExecStart=${INSTALL_DIR}/${APP_NAME}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
TimeoutStartSec=30

# Additional hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=graphical.target
EOF

# Set up log rotation
log "Configuring log rotation..."
cat > /etc/logrotate.d/pyreportal << 'EOF'
/var/log/pyreportal.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
}
EOF

# Create log directory
mkdir -p /var/log
touch /var/log/pyreportal.log
chown pi:pi /var/log/pyreportal.log

# Enable and start service
log "Enabling and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# Wait a moment for system to process
sleep 2

if systemctl start "$SERVICE_NAME"; then
    success "Service started successfully!"
    
    # Wait for service to initialize
    sleep 5
    
    # Check service status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "PyrePortal is running!"
    else
        warning "Service may not be fully started yet. Check status with: systemctl status $SERVICE_NAME"
    fi
else
    error "Failed to start service!"
    log "Check logs with: journalctl -u $SERVICE_NAME -n 20"
    exit 1
fi

# Clean up temporary files
log "Cleaning up..."
rm -f /tmp/*.deb /tmp/device-config.env /tmp/install-on-pi.sh

# Display final status
log "Installation Summary:"
log "- Application: $INSTALL_DIR/$APP_NAME"
log "- Service: $SERVICE_NAME"
log "- Environment: /etc/environment"
log "- Logs: journalctl -u $SERVICE_NAME"

success "PyrePortal installation completed!"

# Show current status
systemctl status "$SERVICE_NAME" --no-pager -l || true
```

Make the installation script executable:

```bash
chmod +x deploy/install-on-pi.sh
```

## Configuration Management

### Fleet Management Script

Create `deploy/configure-fleet.sh` for managing multiple Pis:

```bash
#!/bin/bash
set -e

# Configuration file with Pi mappings
CONFIG_FILE="${1:-deploy/fleet-config.txt}"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating example fleet configuration..."
    cat > deploy/fleet-config.txt << 'EOF'
# Fleet Configuration
# Format: IP_ADDRESS DEVICE_ID LOCATION
192.168.1.100 classroom_a_pi01 "Building A - Room 101"
192.168.1.101 classroom_a_pi02 "Building A - Room 102"
192.168.1.102 classroom_b_pi01 "Building B - Room 201"
192.168.1.103 library_pi01 "Library - Main Desk"
192.168.1.104 cafeteria_pi01 "Cafeteria - Entrance"
EOF
    echo "Please edit deploy/fleet-config.txt and run again"
    exit 1
fi

echo "🚀 Deploying to Pi fleet..."

# Read configuration and deploy
while IFS=' ' read -r ip device_id location || [ -n "$ip" ]; do
    # Skip comments and empty lines
    [[ "$ip" =~ ^#.*$ ]] && continue
    [[ -z "$ip" ]] && continue
    
    echo "📍 Deploying to $ip ($device_id)..."
    
    if ./deploy-to-pi.sh "$ip" "$device_id" "$location"; then
        echo "✅ $ip deployment successful"
    else
        echo "❌ $ip deployment failed"
    fi
    
    echo "---"
done < "$CONFIG_FILE"

echo "🎉 Fleet deployment completed!"
```

### Health Check Script

Create `deploy/health-check.sh`:

```bash
#!/bin/bash

CONFIG_FILE="${1:-deploy/fleet-config.txt}"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Fleet configuration file not found: $CONFIG_FILE"
    exit 1
fi

echo "🔍 Checking Pi fleet health..."
echo

while IFS=' ' read -r ip device_id location || [ -n "$ip" ]; do
    [[ "$ip" =~ ^#.*$ ]] && continue
    [[ -z "$ip" ]] && continue
    
    printf "%-15s %-20s " "$ip" "$device_id"
    
    # Check if Pi is reachable
    if ping -c 1 -W 2 "$ip" >/dev/null 2>&1; then
        # Check service status
        if ssh -o ConnectTimeout=5 "pi@$ip" "systemctl is-active --quiet pyreportal" 2>/dev/null; then
            echo "🟢 Running"
        else
            echo "🔴 Service Down"
        fi
    else
        echo "🔴 Unreachable"
    fi
done < "$CONFIG_FILE"
```

### Update Configuration Script

Create `deploy/update-config.sh`:

```bash
#!/bin/bash
set -e

PI_HOST="$1"
CONFIG_TYPE="${2:-api}"

if [ -z "$PI_HOST" ]; then
    echo "Usage: $0 <pi-ip> [config-type]"
    echo "Config types: api, device, all"
    exit 1
fi

case "$CONFIG_TYPE" in
    "api")
        echo "Updating API configuration..."
        cat > /tmp/api-config.env << 'EOF'
VITE_API_BASE_URL=https://api.yourschool.edu
VITE_DEVICE_API_KEY=new_api_key_here
EOF
        scp /tmp/api-config.env "pi@$PI_HOST:/tmp/"
        ssh "pi@$PI_HOST" "sudo bash -c 'source /tmp/api-config.env && sed -i \"s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=\$VITE_API_BASE_URL|\" /etc/environment && sed -i \"s|VITE_DEVICE_API_KEY=.*|VITE_DEVICE_API_KEY=\$VITE_DEVICE_API_KEY|\" /etc/environment'"
        ;;
    "device")
        echo "Enter new device ID:"
        read -r device_id
        echo "Enter new location:"
        read -r location
        ssh "pi@$PI_HOST" "sudo sed -i 's|DEVICE_ID=.*|DEVICE_ID=$device_id|' /etc/environment && sudo sed -i 's|LOCATION=.*|LOCATION=$location|' /etc/environment"
        ;;
    "all")
        echo "Full configuration update..."
        ./deploy-to-pi.sh "$PI_HOST"
        exit 0
        ;;
    *)
        echo "Unknown config type: $CONFIG_TYPE"
        exit 1
        ;;
esac

# Restart service to apply changes
ssh "pi@$PI_HOST" "sudo systemctl restart pyreportal"
echo "✅ Configuration updated and service restarted"
```

## Update Strategy

### Application Update Script

Create `deploy/update-app.sh`:

```bash
#!/bin/bash
set -e

PI_HOST="$1"
UPDATE_TYPE="${2:-app}"

if [ -z "$PI_HOST" ]; then
    echo "Usage: $0 <pi-ip> [update-type]"
    echo "Update types: app, config, full"
    exit 1
fi

echo "🔄 Updating PyrePortal on $PI_HOST..."

case "$UPDATE_TYPE" in
    "app")
        # Quick app update (just the binary)
        echo "Building latest version..."
        npm run tauri build -- --target aarch64-unknown-linux-gnu
        
        BUILD_DIR="src-tauri/target/aarch64-unknown-linux-gnu/release"
        BINARY_PATH="$BUILD_DIR/pyreportal"
        
        if [ ! -f "$BINARY_PATH" ]; then
            echo "❌ Binary not found at $BINARY_PATH"
            exit 1
        fi
        
        echo "Updating binary on Pi..."
        ssh "pi@$PI_HOST" "sudo systemctl stop pyreportal"
        scp "$BINARY_PATH" "pi@$PI_HOST:/tmp/"
        ssh "pi@$PI_HOST" "sudo mv /tmp/pyreportal /opt/pyreportal/ && sudo chmod +x /opt/pyreportal/pyreportal && sudo systemctl start pyreportal"
        ;;
    "config")
        # Update only configuration
        ./deploy/update-config.sh "$PI_HOST" all
        ;;
    "full")
        # Full deployment
        ./deploy-to-pi.sh "$PI_HOST"
        ;;
    *)
        echo "Unknown update type: $UPDATE_TYPE"
        exit 1
        ;;
esac

# Verify update
echo "Verifying update..."
sleep 5

if ssh "pi@$PI_HOST" "systemctl is-active --quiet pyreportal"; then
    echo "✅ Update successful - PyrePortal is running"
else
    echo "❌ Update may have failed - check service status"
    ssh "pi@$PI_HOST" "sudo systemctl status pyreportal --no-pager"
fi
```

### Rollback Script

Create `deploy/rollback.sh`:

```bash
#!/bin/bash
set -e

PI_HOST="$1"

if [ -z "$PI_HOST" ]; then
    echo "Usage: $0 <pi-ip>"
    exit 1
fi

echo "🔄 Rolling back PyrePortal on $PI_HOST..."

# Create a simple rollback by reinstalling the last known good version
# This assumes you tag your releases appropriately

LAST_GOOD_VERSION="${2:-v1.0.0}"

echo "Rolling back to version: $LAST_GOOD_VERSION"

# Checkout the last good version
git checkout "$LAST_GOOD_VERSION"

# Deploy that version
./deploy-to-pi.sh "$PI_HOST"

# Return to main branch
git checkout main

echo "✅ Rollback completed"
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Service Won't Start

```bash
# Check service status
sudo systemctl status pyreportal

# View detailed logs
sudo journalctl -u pyreportal -n 50

# Common causes:
# - Binary permissions: sudo chmod +x /opt/pyreportal/pyreportal
# - Missing dependencies: sudo apt install -f
# - Display issues: Check DISPLAY environment variable
```

#### 2. Network/API Issues

```bash
# Test API connectivity
curl -v "$VITE_API_BASE_URL/health" -H "Authorization: Bearer $VITE_DEVICE_API_KEY"

# Check environment variables
sudo systemctl show pyreportal --property=Environment

# Verify DNS resolution
nslookup api.yourschool.edu
```

#### 3. Display Issues

```bash
# Check X11 forwarding
echo $DISPLAY

# Test display access
sudo -u pi DISPLAY=:0 xterm

# Fix permissions if needed
sudo chown pi:pi /tmp/.X11-unix/X0
```

#### 4. Cross-Compilation Issues

```bash
# Verify target is installed
rustup target list | grep aarch64-unknown-linux-gnu

# Check cross-compiler
aarch64-linux-gnu-gcc --version

# Clean and rebuild
npm run clean:target
npm run tauri build -- --target aarch64-unknown-linux-gnu
```

### Debug Mode

For troubleshooting, you can enable debug mode:

```bash
# Add to /etc/environment
RUST_LOG=debug
TAURI_DEBUG=true

# Restart service
sudo systemctl restart pyreportal
```

### Log Analysis

Create `deploy/analyze-logs.sh`:

```bash
#!/bin/bash

PI_HOST="$1"
LINES="${2:-100}"

if [ -z "$PI_HOST" ]; then
    echo "Usage: $0 <pi-ip> [lines]"
    exit 1
fi

echo "📊 Analyzing logs from $PI_HOST (last $LINES lines)..."

ssh "pi@$PI_HOST" "sudo journalctl -u pyreportal -n $LINES --no-pager" | \
grep -E "(ERROR|WARN|Failed|Exception)" | \
sort | uniq -c | sort -nr

echo
echo "Recent errors:"
ssh "pi@$PI_HOST" "sudo journalctl -u pyreportal -n $LINES --no-pager" | \
grep -E "ERROR" | tail -5
```

## Security Considerations

### Network Security

1. **Firewall Configuration**
   ```bash
   # Basic firewall setup on Pi
   sudo ufw enable
   sudo ufw allow ssh
   sudo ufw allow from 192.168.1.0/24  # Local network only
   ```

2. **SSH Hardening**
   ```bash
   # Disable password authentication
   sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
   sudo systemctl restart ssh
   ```

### Application Security

1. **API Key Management**
   - Use device-specific API keys
   - Implement key rotation
   - Monitor API usage for anomalies

2. **File Permissions**
   ```bash
   # Secure environment file
   sudo chmod 600 /etc/environment
   sudo chown root:root /etc/environment
   
   # Secure application directory
   sudo chown -R pi:pi /opt/pyreportal
   sudo chmod 755 /opt/pyreportal
   sudo chmod 755 /opt/pyreportal/pyreportal
   ```

3. **Service Hardening**
   ```ini
   # Additional systemd security options
   [Service]
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   PrivateTmp=true
   ProtectKernelTunables=true
   ProtectControlGroups=true
   ```

### Monitoring and Alerting

Create `deploy/monitor.sh`:

```bash
#!/bin/bash

CONFIG_FILE="${1:-deploy/fleet-config.txt}"
ALERT_EMAIL="${ALERT_EMAIL:-admin@yourschool.edu}"

check_pi() {
    local ip="$1"
    local device_id="$2"
    
    # Check if Pi is reachable
    if ! ping -c 1 -W 5 "$ip" >/dev/null 2>&1; then
        echo "ALERT: $device_id ($ip) is unreachable"
        return 1
    fi
    
    # Check service status
    if ! ssh -o ConnectTimeout=10 "pi@$ip" "systemctl is-active --quiet pyreportal" 2>/dev/null; then
        echo "ALERT: $device_id ($ip) service is not running"
        return 1
    fi
    
    # Check API connectivity (if curl is available)
    if ssh "pi@$ip" "command -v curl >/dev/null" 2>/dev/null; then
        if ! ssh "pi@$ip" "curl -s --max-time 10 \$VITE_API_BASE_URL/health >/dev/null" 2>/dev/null; then
            echo "WARNING: $device_id ($ip) cannot reach API"
            return 1
        fi
    fi
    
    return 0
}

# Monitor all Pis
alerts=()
while IFS=' ' read -r ip device_id location || [ -n "$ip" ]; do
    [[ "$ip" =~ ^#.*$ ]] && continue
    [[ -z "$ip" ]] && continue
    
    if ! check_pi "$ip" "$device_id"; then
        alerts+=("$device_id ($ip)")
    fi
done < "$CONFIG_FILE"

# Send alerts if any issues found
if [ ${#alerts[@]} -gt 0 ]; then
    echo "Found ${#alerts[@]} issues:"
    printf '%s\n' "${alerts[@]}"
    
    # Send email if configured
    if command -v mail >/dev/null && [ -n "$ALERT_EMAIL" ]; then
        {
            echo "PyrePortal Alert Summary"
            echo "========================"
            echo "Date: $(date)"
            echo "Issues found: ${#alerts[@]}"
            echo
            printf '%s\n' "${alerts[@]}"
        } | mail -s "PyrePortal Fleet Alert" "$ALERT_EMAIL"
    fi
    
    exit 1
else
    echo "All Pis are healthy ✅"
    exit 0
fi
```

### Backup and Recovery

Create `deploy/backup.sh`:

```bash
#!/bin/bash

PI_HOST="$1"
BACKUP_DIR="${2:-backups}"

if [ -z "$PI_HOST" ]; then
    echo "Usage: $0 <pi-ip> [backup-dir]"
    exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pyreportal_${PI_HOST}_${TIMESTAMP}.tar.gz"

echo "🔄 Creating backup of $PI_HOST..."

# Create backup archive on Pi
ssh "pi@$PI_HOST" "sudo tar -czf /tmp/pyreportal_backup.tar.gz \
    /etc/environment \
    /etc/systemd/system/pyreportal.service \
    /opt/pyreportal/ \
    /var/log/pyreportal.log* \
    2>/dev/null || true"

# Download backup
scp "pi@$PI_HOST:/tmp/pyreportal_backup.tar.gz" "$BACKUP_FILE"

# Clean up
ssh "pi@$PI_HOST" "rm -f /tmp/pyreportal_backup.tar.gz"

echo "✅ Backup saved to: $BACKUP_FILE"
```

## Quick Reference

### Essential Commands

```bash
# Deploy to single Pi
./deploy-to-pi.sh 192.168.1.100

# Deploy to fleet
./deploy/configure-fleet.sh

# Update application only
./deploy/update-app.sh 192.168.1.100 app

# Check fleet health
./deploy/health-check.sh

# View logs
ssh pi@192.168.1.100 "sudo journalctl -u pyreportal -f"

# Restart service
ssh pi@192.168.1.100 "sudo systemctl restart pyreportal"

# Emergency stop
ssh pi@192.168.1.100 "sudo systemctl stop pyreportal"
```

### File Structure

```
PyrePortal/
├── deploy-to-pi.sh              # Main deployment script
├── deploy/
│   ├── install-on-pi.sh         # Pi installation script
│   ├── configure-fleet.sh       # Fleet management
│   ├── health-check.sh          # Health monitoring
│   ├── update-app.sh            # Update utilities
│   ├── backup.sh                # Backup utilities
│   └── fleet-config.txt         # Pi configuration
├── .cargo/
│   └── config.toml              # Cross-compilation config
└── src-tauri/
    └── tauri.conf.json          # Tauri configuration
```

This guide provides everything you need for a production-ready Raspberry Pi deployment of PyrePortal. Remember to test thoroughly in a staging environment before deploying to production devices.