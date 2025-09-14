# 🎉 WORKING Raspberry Pi 5 Kiosk Setup for PyrePortal

**SUCCESS CONFIRMED** ✅ - This configuration works perfectly!

## Hardware Configuration
- **Device**: Raspberry Pi 5 Model B Rev 1.1
- **Display**: ILI9881 7-inch DSI touchscreen (720x1280 native portrait)
- **OS**: Raspberry Pi OS Bookworm 64-bit
- **Target**: Boot directly to PyrePortal in landscape mode with working touch

## The Problem We Solved
After many attempts with Wayland compositors (labwc, Cage), the solution was to use **X11 with proper display rotation and touch calibration**. The key insight was that hardware rotation alone wasn't enough - we needed software rotation via `xrandr` plus correct touch coordinate transformation.

---

## Complete Step-by-Step Implementation

### Step 1: Clean Up Previous Attempts
Remove all previous configuration attempts:

```bash
# Switch to X11 from Wayland
sudo raspi-config nonint do_wayland W1

# Set Console Autologin  
sudo raspi-config nonint do_boot_behaviour B2

# Remove old config files
rm -f ~/.xinitrc ~/.bash_profile ~/launch_kiosk.sh
rm -rf ~/.config/labwc

# Remove old touch configuration
sudo rm -f /etc/X11/xorg.conf.d/99-calibration.conf
```

### Step 2: Install Required Packages
Install all necessary packages for X11 kiosk operation:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libgtk-3-dev \
  pkg-config \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  matchbox-window-manager \
  unclutter
```

### Step 3: Configure Display Hardware
**File**: `/boot/firmware/config.txt`

Ensure the display overlay is configured with 90-degree rotation:

```ini
# Existing content should already include:
dtoverlay=vc4-kms-dsi-ili9881-7inch,rotation=90
gpu_mem=128
dtoverlay=vc4-kms-v3d

# Add these boot optimizations:
disable_splash=1
boot_delay=0
dtoverlay=disable-bt
```

### Step 4: Create Touch Input Configuration
**File**: `/etc/X11/xorg.conf.d/99-calibration.conf` (create this file)

```bash
sudo mkdir -p /etc/X11/xorg.conf.d
sudo bash -c 'cat > /etc/X11/xorg.conf.d/99-calibration.conf << "EOF"
Section "InputClass"
    Identifier "calibration"
    MatchProduct "Goodix Capacitive TouchScreen"
    Option "TransformationMatrix" "0 -1 1 1 0 0 0 0 1"
EndSection
EOF'
```

**Critical**: This matrix `"0 -1 1 1 0 0 0 0 1"` is for left rotation (landscape mode).

### Step 5: Configure Boot Message Suppression  
**File**: `/boot/firmware/cmdline.txt`

Modify to redirect console and disable boot messages:

```bash
# Change console=tty1 to console=tty3 and add Plymouth disable options
sudo sed -i 's/console=tty1/console=tty3/' /boot/firmware/cmdline.txt
# Add plymouth.enable=0 and systemd.show_status=no to the end
```

Final cmdline.txt should look like:
```
console=serial0,115200 console=tty3 root=PARTUUID=e78649fb-02 rootfstype=ext4 fsck.repair=yes rootwait quiet splash plymouth.ignore-serial-consoles plymouth.enable=0 systemd.show_status=no cfg80211.ieee80211_regdom=DE quiet loglevel=0 vt.global_cursor_default=0 consoleblank=0 logo.nologo
```

### Step 6: Create Kiosk Startup Script
**File**: `/home/moto/start-tauri-kiosk.sh` (create this file)

```bash
cat > /home/moto/start-tauri-kiosk.sh << 'EOF'
#!/bin/bash

# Set environment for Tauri/WebKitGTK
export DISPLAY=:0
export GDK_BACKEND=x11
export XDG_SESSION_TYPE=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export VITE_API_BASE_URL="https://api.moto-app.de"
export VITE_DEVICE_API_KEY="dev_3236de5e4c4140f273299adbb1bd5d6036bad1a47daab0b0c700201ca0aab6ca"

# Disable screen blanking and power management
xset -dpms
xset s off
xset s noblank

# 🔥 KEY FIX: Force display to landscape orientation
xrandr --output DSI-1 --rotate left

# Hide mouse cursor after 3 seconds of inactivity
unclutter -idle 3 &

# Start minimal window manager
matchbox-window-manager -use_titlebar no -use_cursor no &

# Wait for window manager
sleep 3

# Launch Tauri application with respawn loop
while true; do
    cd /home/moto/PyrePortal
    ./src-tauri/target/release/pyreportal
    
    # If app exits, wait a moment before restarting
    sleep 1
done
EOF

chmod +x /home/moto/start-tauri-kiosk.sh
```

### Step 7: Create X11 Initialization File
**File**: `/home/moto/.xinitrc` (create this file)

```bash
cat > /home/moto/.xinitrc << 'EOF'
#!/bin/bash
exec /home/moto/start-tauri-kiosk.sh
EOF
```

### Step 8: Configure Auto X11 Startup
**File**: `/home/moto/.bash_profile` (create this file)

```bash
cat > /home/moto/.bash_profile << 'EOF'
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    startx -- -nocursor
fi
EOF
```

### Step 9: Suppress Login Messages
**File**: `/home/moto/.hushlogin` (create this file)

```bash
touch /home/moto/.hushlogin
```

### Step 10: Configure Silent Getty Autologin
**File**: `/etc/systemd/system/getty@tty1.service.d/autologin.conf` (create this file)

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo bash -c 'cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << "EOF"
[Service]
ExecStart=
ExecStart=-/sbin/agetty --skip-login --noclear --noissue --login-options "-f moto" %I $TERM
EOF'

sudo systemctl daemon-reload
```

### Step 11: Disable Unnecessary Services
Optimize boot time by disabling unused services:

```bash
sudo systemctl disable bluetooth.service avahi-daemon.service ModemManager.service
```

### Step 12: Final Reboot
```bash
sudo reboot
```

---

## What Each Fix Does

### 🖥️ Display Rotation Fix
- **Hardware rotation**: `dtoverlay=vc4-kms-dsi-ili9881-7inch,rotation=90` rotates the framebuffer
- **Software rotation**: `xrandr --output DSI-1 --rotate left` ensures X11 applications see landscape
- **Result**: Display appears in proper landscape orientation (1280x720 logical)

### 👆 Touch Input Fix  
- **Transformation matrix**: `"0 -1 1 1 0 0 0 0 1"` maps touch coordinates for left rotation
- **No SwapXY**: Removed conflicting SwapXY option that was causing coordinate issues
- **Result**: Touch coordinates perfectly aligned with landscape display

### 🚫 Console Suppression Fix
- **Console redirect**: `console=tty3` moves boot messages away from main display
- **Plymouth disable**: `plymouth.enable=0` prevents splash screen interference  
- **Systemd silence**: `systemd.show_status=no` hides service startup messages
- **Getty silence**: `--skip-login --noissue --noclear` prevents login prompts
- **Hushlogin**: `.hushlogin` suppresses login welcome messages
- **Result**: No console text visible at any point

### 🔄 App Respawn Fix
- **Infinite loop**: `while true; do ... done` restarts PyrePortal if it exits
- **Result**: App automatically restarts, user never sees console

---

## Key Environment Variables

These WebKit environment variables are critical for Tauri stability:

```bash
export GDK_BACKEND=x11                        # Force X11 backend
export XDG_SESSION_TYPE=x11                   # Tell session it's X11  
export WEBKIT_DISABLE_COMPOSITING_MODE=1      # Disable GPU compositing
export WEBKIT_DISABLE_DMABUF_RENDERER=1       # Disable problematic renderer
```

---

## File Summary

### Files Created:
- `/home/moto/start-tauri-kiosk.sh` - Main kiosk startup script
- `/home/moto/.xinitrc` - X11 initialization 
- `/home/moto/.bash_profile` - Auto-start X11 on login
- `/home/moto/.hushlogin` - Suppress login messages
- `/etc/X11/xorg.conf.d/99-calibration.conf` - Touch calibration
- `/etc/systemd/system/getty@tty1.service.d/autologin.conf` - Silent login

### Files Modified:
- `/boot/firmware/config.txt` - Added boot optimizations
- `/boot/firmware/cmdline.txt` - Console redirection and message suppression

---

## Why This Works vs Previous Attempts

### ❌ What Didn't Work:
- **Wayland + labwc**: Inconsistent rotation support
- **Wayland + Cage**: No rotation support in version 0.2.0
- **Hardware rotation only**: Applications still rendered in portrait
- **Wrong touch matrices**: Coordinates misaligned with display

### ✅ What Works:
- **X11 + matchbox-window-manager**: Stable, reliable window management
- **Combined rotation**: Hardware (90°) + Software (left) = perfect landscape
- **Correct touch matrix**: `"0 -1 1 1 0 0 0 0 1"` for left rotation
- **Complete console suppression**: Multiple layers of message hiding
- **Auto-respawn**: App restarts automatically if closed

---

## Final Result

🎉 **Perfect kiosk mode achieved:**
- ✅ Boots directly to PyrePortal in 5-10 seconds
- ✅ Display in proper landscape orientation (1280x720)
- ✅ Touch input perfectly aligned with display
- ✅ No console messages visible at any time
- ✅ App automatically restarts if closed
- ✅ Hidden cursor for clean appearance
- ✅ No desktop environment or window decorations

**This setup is production-ready for kiosk deployment!**