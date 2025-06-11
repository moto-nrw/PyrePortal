# Raspberry Pi Deployment Blueprint for PyrePortal

## Build Strategy

### Option 1: Native Pi Build (Recommended)

Build directly on Raspberry Pi hardware to avoid cross-compilation issues.

**Setup**:

- Use Raspberry Pi 4 (8GB) with 64-bit OS
- Install build dependencies: Node.js, Rust, webkit2gtk-4.1, build tools
- Clone repository and build with `npm run tauri build`

**Pros**: Most reliable, no dependency issues
**Cons**: Slow builds (30-60 minutes)

### Option 2: GitHub Actions with ARM64 Emulation

Use QEMU emulation for automated builds.

**Setup**:

- Configure GitHub Actions with `uraimo/run-on-arch-action`
- Build ARM64 .deb packages in CI pipeline
- Download artifacts for deployment

**Pros**: Automated, centralized
**Cons**: 8x slower due to emulation, reliability issues

## Deployment Architecture

### Core Components

1. **systemd service** for auto-startup and restart
2. **Environment file** at `/etc/systemd/system/pyreportal.env`
3. **Service hardening** with restricted filesystem access
4. **Deployment script** for automated installation

### File Structure

```
/opt/pyreportal/                     # Application directory
├── pyreportal                       # Binary executable
/etc/systemd/system/
├── pyreportal.service              # systemd service definition
├── pyreportal.env                  # Environment variables
```

## Implementation Workflow

### 1. Build Preparation

- Set up build environment (Pi or GitHub Actions)
- Configure environment variables for production API
- Generate ARM64 .deb package

### 2. Pi Setup

- Install Raspberry Pi OS 64-bit
- Configure SSH access and static IP
- Install system dependencies

### 3. Application Deployment

- Transfer .deb package to Pi
- Install package with `dpkg -i`
- Create systemd service and environment files
- Enable and start service

### 4. Service Configuration

Create systemd service with:

- Dependency on `graphical.target` and `network-online.target`
- Environment file loading
- Automatic restart on failure
- Security restrictions

## Critical Implementation Notes

### Known Issues & Mitigations

**Tauri Display Problems**:

- Tauri apps may show visual corruption on Pi hardware
- Test thoroughly on target devices before deployment
- Consider Electron as fallback if issues persist

**WebKit2GTK Dependencies**:

- Use `webkit2gtk-4.1` (not 4.0) for Tauri 2.0
- Pin dependency versions to avoid compatibility issues
- Build on same OS version as deployment target

**systemd Timing Issues**:

- Add startup delays (`ExecStartPre=/bin/sleep 10`)
- Use proper target dependencies
- Set `DISPLAY=:0` environment variable
- Ensure pi user has X11 access

### Environment Variables

**Build-time**: Inject API configuration during build process
**Runtime**: Use dedicated service environment file
**Security**: Set proper file permissions (600) and ownership

## Deployment Script Template

Essential deployment automation:

1. **Connectivity check**: Verify Pi is reachable via SSH
2. **Package transfer**: Copy .deb and configuration files
3. **Installation**: Run installation script on Pi
4. **Service setup**: Create and enable systemd service
5. **Verification**: Check service status and functionality

## Fleet Management

### Multi-Device Deployment

- Maintain device inventory with IP addresses and IDs
- Use configuration templates with device-specific values
- Implement health monitoring and update mechanisms
- Plan for staged rollouts and rollback procedures

### Monitoring & Maintenance

- Log aggregation via systemd journal
- Automated health checks
- Remote restart capabilities
- Configuration backup and restore

## Risk Factors & Solutions

### High Risk

- **Visual corruption**: Extensive testing required
- **Dependency failures**: Use known-good package versions
- **Boot timing**: Robust service configuration needed

### Medium Risk

- **Build consistency**: Standardize build environment
- **Network issues**: Implement retry logic
- **Hardware failures**: Monitoring and replacement procedures

This blueprint focuses on practical implementation while acknowledging the technical challenges specific to Tauri on Raspberry Pi hardware.
