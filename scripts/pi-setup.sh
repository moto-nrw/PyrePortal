#!/bin/bash
# Initial setup script for PyrePortal on Raspberry Pi
# Run this on each Pi after cloning the base image

set -e

# Configuration
GITHUB_REPO="moto-nrw/PyrePortal"
INSTALL_DIR="/home/moto/Desktop/PyrePortal"
SERVICE_NAME="pyreportal"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}PyrePortal Pi Setup Script${NC}"
echo "=============================="

# Get device number
read -p "Enter device number (e.g., 001 for moto-001): " DEVICE_NUM
HOSTNAME="moto-${DEVICE_NUM}"

# Set hostname
echo -e "${YELLOW}Setting hostname to ${HOSTNAME}...${NC}"
sudo hostnamectl set-hostname ${HOSTNAME}
sudo sed -i "s/127.0.1.1.*/127.0.1.1\t${HOSTNAME}/g" /etc/hosts

# Create installation directory
echo -e "${YELLOW}Creating installation directory...${NC}"
mkdir -p ${INSTALL_DIR}
cd ${INSTALL_DIR}

# Create .env file
echo -e "${YELLOW}Creating .env file...${NC}"
read -p "Enter API URL (e.g., http://server.local:3000): " API_URL
read -p "Enter API Key for this device: " API_KEY

cat > .env << EOF
# PyrePortal Environment Configuration
VITE_API_URL=${API_URL}
VITE_API_KEY=${API_KEY}
VITE_DEVICE_ID=${HOSTNAME}
EOF

# Download latest release
echo -e "${YELLOW}Downloading latest PyrePortal release...${NC}"
LATEST_RELEASE=$(curl -s https://api.github.com/repos/${GITHUB_REPO}/releases/latest | grep "tag_name" | cut -d'"' -f4)
if [ -z "$LATEST_RELEASE" ]; then
    echo -e "${RED}Error: Could not fetch latest release. Please check GITHUB_REPO setting.${NC}"
    exit 1
fi

DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_RELEASE}/pyreportal-${LATEST_RELEASE#v}-armhf.tar.gz"
wget -O pyreportal.tar.gz ${DOWNLOAD_URL}

# Extract binary
echo -e "${YELLOW}Extracting binary...${NC}"
tar -xzf pyreportal.tar.gz
rm pyreportal.tar.gz
chmod +x pyre-portal

# Create update script
echo -e "${YELLOW}Creating update script...${NC}"
cat > update-pyreportal.sh << 'EOF'
#!/bin/bash
# Auto-update script for PyrePortal

GITHUB_REPO="moto-nrw/PyrePortal"
INSTALL_DIR="/home/moto/Desktop/PyrePortal"
LOG_FILE="/home/moto/.pyreportal-update.log"

echo "[$(date)] Checking for updates..." >> ${LOG_FILE}

cd ${INSTALL_DIR}

# Get current version
CURRENT_VERSION=$(./pyre-portal --version 2>/dev/null || echo "0.0.0")

# Get latest version
LATEST_RELEASE=$(curl -s https://api.github.com/repos/${GITHUB_REPO}/releases/latest | grep "tag_name" | cut -d'"' -f4)
LATEST_VERSION=${LATEST_RELEASE#v}

if [ "${CURRENT_VERSION}" != "${LATEST_VERSION}" ]; then
    echo "[$(date)] Updating from ${CURRENT_VERSION} to ${LATEST_VERSION}..." >> ${LOG_FILE}
    
    # Download new version
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_RELEASE}/pyreportal-${LATEST_VERSION}-armhf.tar.gz"
    wget -q -O pyreportal-new.tar.gz ${DOWNLOAD_URL}
    
    # Backup current binary
    cp pyre-portal pyre-portal.backup
    
    # Extract new binary
    tar -xzf pyreportal-new.tar.gz
    rm pyreportal-new.tar.gz
    chmod +x pyre-portal
    
    echo "[$(date)] Update complete!" >> ${LOG_FILE}
else
    echo "[$(date)] Already up to date (${CURRENT_VERSION})" >> ${LOG_FILE}
fi
EOF

# Update the GITHUB_REPO in the update script
sed -i "s|YOUR_GITHUB_USERNAME/PyrePortal|${GITHUB_REPO}|g" update-pyreportal.sh
chmod +x update-pyreportal.sh

# Create desktop shortcut
echo -e "${YELLOW}Creating desktop shortcut...${NC}"
cat > ~/Desktop/PyrePortal.desktop << EOF
[Desktop Entry]
Name=PyrePortal
Comment=PyrePortal Kiosk Application
Exec=${INSTALL_DIR}/pyre-portal
Icon=${INSTALL_DIR}/icon.png
Terminal=false
Type=Application
Categories=Application;
EOF
chmod +x ~/Desktop/PyrePortal.desktop

# Create systemd service for auto-start
echo -e "${YELLOW}Creating auto-start service...${NC}"
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=PyrePortal Kiosk Application
After=graphical.target

[Service]
Type=simple
User=moto
WorkingDirectory=${INSTALL_DIR}
ExecStartPre=/bin/bash ${INSTALL_DIR}/update-pyreportal.sh
ExecStart=${INSTALL_DIR}/pyre-portal
Restart=on-failure
RestartSec=10
Environment="DISPLAY=:0"

[Install]
WantedBy=graphical.target
EOF

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}.service

# Create a simple monitoring script
echo -e "${YELLOW}Creating monitoring script...${NC}"
cat > check-pyreportal.sh << 'EOF'
#!/bin/bash
# Simple monitoring script for PyrePortal

if systemctl is-active --quiet pyreportal.service; then
    echo "✅ PyrePortal is running"
else
    echo "❌ PyrePortal is not running"
    echo "To start: sudo systemctl start pyreportal"
    echo "To check logs: sudo journalctl -u pyreportal -f"
fi
EOF
chmod +x check-pyreportal.sh

echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Reboot to apply hostname change: sudo reboot"
echo "2. PyrePortal will auto-start after reboot"
echo "3. To manually start: sudo systemctl start ${SERVICE_NAME}"
echo "4. To check status: ./check-pyreportal.sh"
echo "5. To view logs: sudo journalctl -u ${SERVICE_NAME} -f"