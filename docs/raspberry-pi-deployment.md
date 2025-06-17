# Raspberry Pi Deployment Guide

This guide explains how to deploy PyrePortal to multiple Raspberry Pi devices.

## Prerequisites

- Raspberry Pi 4/5 with Raspberry Pi OS Desktop (64-bit recommended)
- Base image with PyrePortal dependencies installed
- GitHub repository for hosting releases
- Each Pi needs a unique API key

## Important Note

Cross-compilation from macOS to Raspberry Pi is not straightforward for Tauri applications due to GTK/WebKit dependencies. The recommended approach is to build directly on a Raspberry Pi.

## Deployment Process

### 1. Prepare Base Image

If using an existing development Pi image:

```bash
# Clean up the image
sudo apt clean
sudo apt autoremove
rm -rf ~/.cache/*
rm -rf ~/node_modules
rm -rf ~/.npm
history -c
```

### 2. Build on Raspberry Pi

```bash
# Copy build script to your development Pi
scp scripts/build-on-pi.sh moto@raspberrypi:~/

# SSH into the Pi
ssh moto@raspberrypi

# Run the build script
./build-on-pi.sh

# The script will create a release package in ~/releases/
```

### 3. Get the Built Binary

From your Mac:
```bash
# Copy the release back to your Mac
scp moto@raspberrypi:~/releases/pyreportal-*.tar.gz ./releases/

# Create checksum if needed
cd releases
shasum -a 256 pyreportal-*.tar.gz > pyreportal-*.tar.gz.sha256
```

### 4. Create GitHub Release

Manual release (recommended):
- Go to GitHub → Releases → Create new release
- Tag version (e.g., v1.0.0)
- Upload the `.tar.gz` and `.sha256` files from `releases/` directory

### 4. Deploy to Each Pi

1. **Clone your base SD card** for each Pi

2. **Boot the Pi and run setup**:
   ```bash
   # Download setup script
   wget https://raw.githubusercontent.com/YOUR_USERNAME/PyrePortal/main/scripts/pi-setup.sh
   chmod +x pi-setup.sh
   
   # Run setup
   ./pi-setup.sh
   ```

3. **Enter configuration when prompted**:
   - Device number (e.g., 001 for moto-001)
   - API URL
   - API Key for this device

4. **Reboot the Pi**:
   ```bash
   sudo reboot
   ```

### 5. Verify Deployment

After reboot, PyrePortal should start automatically. Check status:

```bash
# Check if running
~/Desktop/PyrePortal/check-pyreportal.sh

# View logs
sudo journalctl -u pyreportal -f

# Manual start/stop
sudo systemctl start pyreportal
sudo systemctl stop pyreportal
```

## Auto-Updates

Updates are checked on every boot. The update script:
- Compares current version with latest GitHub release
- Downloads and installs new version if available
- Logs all updates to `~/.pyreportal-update.log`

To force an update:
```bash
cd ~/Desktop/PyrePortal
./update-pyreportal.sh
```

## Managing Multiple Pis

### SSH Access

Add to your `~/.ssh/config`:

```
Host moto-*
    User moto
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

Then SSH with: `ssh moto-001`

### Batch Commands

Update all Pis at once:
```bash
for i in {001..010}; do
    ssh moto-$i "cd ~/Desktop/PyrePortal && ./update-pyreportal.sh"
done
```

Check status of all Pis:
```bash
for i in {001..010}; do
    echo -n "moto-$i: "
    ssh moto-$i "systemctl is-active pyreportal" 2>/dev/null || echo "offline"
done
```

## Troubleshooting

### Application won't start
- Check logs: `sudo journalctl -u pyreportal -n 50`
- Verify .env file exists and has correct values
- Ensure binary has execute permissions

### Updates not working
- Check internet connectivity
- Verify GitHub repo URL in update script
- Check update log: `cat ~/.pyreportal-update.log`

### Display issues
- Ensure DISPLAY=:0 is set in service file
- Check if user can access display: `echo $DISPLAY`

## Security Considerations

1. **Change default Pi password** on base image
2. **Use SSH keys** instead of passwords
3. **Configure firewall** if Pis are on public network
4. **Rotate API keys** regularly
5. **Monitor logs** for suspicious activity

## Next Steps

Consider implementing:
- Central logging server
- Monitoring dashboard
- Automated configuration management (Ansible)
- VPN for remote access
- Backup strategy for Pi configurations