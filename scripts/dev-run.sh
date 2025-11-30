#!/bin/bash
#
# dev-run.sh - Development runner for PyrePortal on Raspberry Pi
#
# Usage:
#   ./scripts/dev-run.sh              # Run release binary
#   ./scripts/dev-run.sh --dev        # Run tauri dev (Hot-Reload for frontend)
#   ./scripts/dev-run.sh --build      # Build release first, then run
#   ./scripts/dev-run.sh --fullscreen # Run in fullscreen mode
#   ./scripts/dev-run.sh --debug      # Enable debug logging
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_PATH="$PROJECT_ROOT/src-tauri/target/release/pyreportal"
ENV_FILE="$PROJECT_ROOT/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
RUN_MODE="release"  # release, dev, or build
FULLSCREEN=""
LOG_LEVEL="info"
SKIP_ROTATION=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            RUN_MODE="dev"
            shift
            ;;
        --build|-b)
            RUN_MODE="build"
            shift
            ;;
        --fullscreen|-f)
            FULLSCREEN="true"
            shift
            ;;
        --windowed|-w)
            FULLSCREEN="false"
            shift
            ;;
        --debug|-d)
            LOG_LEVEL="debug"
            shift
            ;;
        --trace|-t)
            LOG_LEVEL="trace"
            shift
            ;;
        --no-rotate)
            SKIP_ROTATION=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Run Modes (pick one):"
            echo "  (default)         Run existing release binary"
            echo "  --dev             Run 'tauri dev' with Hot-Reload (frontend only)"
            echo "  -b, --build       Build release first, then run"
            echo ""
            echo "Options:"
            echo "  -f, --fullscreen  Force fullscreen mode"
            echo "  -w, --windowed    Force windowed mode"
            echo "  -d, --debug       Enable debug logging (RUST_LOG=debug)"
            echo "  -t, --trace       Enable trace logging (RUST_LOG=trace)"
            echo "  --no-rotate       Skip display rotation (for HDMI or pre-rotated displays)"
            echo "  -h, --help        Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 --dev              # Frontend entwickeln mit Hot-Reload"
            echo "  $0 --build --debug    # Release bauen und mit Debug-Logs starten"
            echo "  $0 --fullscreen       # Release Binary im Fullscreen starten"
            echo ""
            echo "Environment:"
            echo "  Loads variables from .env file in project root"
            echo "  Override any variable by setting it before running"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PyrePortal Development Runner${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're on a Raspberry Pi
if [[ -f /proc/device-tree/model ]]; then
    PI_MODEL=$(cat /proc/device-tree/model | tr -d '\0')
    echo -e "${GREEN}Running on: $PI_MODEL${NC}"
else
    echo -e "${YELLOW}Warning: Not running on Raspberry Pi${NC}"
fi

# Load .env file
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${GREEN}Loading environment from .env${NC}"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo -e "${YELLOW}Warning: No .env file found at $ENV_FILE${NC}"
    echo -e "${YELLOW}Using default/system environment variables${NC}"
fi

# Override fullscreen if specified via argument
if [[ -n "$FULLSCREEN" ]]; then
    export TAURI_FULLSCREEN="$FULLSCREEN"
fi

# Set logging level
export RUST_LOG="$LOG_LEVEL"

# WebKit environment variables to prevent display corruption (horizontal stripes)
# These are CRITICAL for Tauri/WebKitGTK on Raspberry Pi!
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_BACKEND=x11
export XDG_SESSION_TYPE=x11

# Detect display server
if [[ -n "$WAYLAND_DISPLAY" ]]; then
    DISPLAY_TYPE="Wayland"
elif [[ -n "$DISPLAY" ]]; then
    DISPLAY_TYPE="X11"
else
    # Try to set X11 display if not set
    export DISPLAY=":0"
    DISPLAY_TYPE="X11 (defaulted to :0)"
fi

# Configure display rotation for DSI touchscreen (Pi with portrait display)
configure_display_rotation() {
    if [[ "$SKIP_ROTATION" == "true" ]]; then
        echo -e "${YELLOW}Skipping display rotation (--no-rotate)${NC}"
        return
    fi

    # Only rotate on X11 with DSI display
    if [[ "$DISPLAY_TYPE" != *"X11"* ]]; then
        echo -e "${YELLOW}Display rotation only supported on X11${NC}"
        return
    fi

    # Check if xrandr is available
    if ! command -v xrandr &> /dev/null; then
        echo -e "${YELLOW}xrandr not found, skipping rotation${NC}"
        return
    fi

    # Detect DSI display
    DSI_OUTPUT=$(xrandr 2>/dev/null | grep -E "DSI.*connected" | awk '{print $1}' | head -1)

    if [[ -n "$DSI_OUTPUT" ]]; then
        echo -e "${BLUE}Detected DSI display: $DSI_OUTPUT${NC}"

        # Check current rotation
        CURRENT_ROTATION=$(xrandr --verbose 2>/dev/null | grep -A5 "^$DSI_OUTPUT" | grep "Rotation:" | awk '{print $2}')

        if [[ "$CURRENT_ROTATION" == "left" ]]; then
            echo -e "${GREEN}Display already rotated to landscape${NC}"
        else
            echo -e "${BLUE}Rotating display to landscape (left)...${NC}"
            if xrandr --output "$DSI_OUTPUT" --rotate left 2>/dev/null; then
                echo -e "${GREEN}Display rotation applied${NC}"
            else
                echo -e "${RED}Failed to rotate display${NC}"
                echo -e "${YELLOW}You may need to run: xrandr --output $DSI_OUTPUT --rotate left${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}No DSI display detected (HDMI only?)${NC}"
    fi
}

# Check GPIO permissions (for RFID/SPI)
check_hardware_access() {
    echo ""
    if [[ -e /dev/gpiomem ]]; then
        if [[ -r /dev/gpiomem ]]; then
            echo -e "${GREEN}GPIO access: OK${NC}"
        else
            echo -e "${YELLOW}Warning: No read access to /dev/gpiomem${NC}"
            echo -e "${YELLOW}Run: sudo usermod -aG gpio \$USER && logout/login${NC}"
        fi
    fi

    if [[ -e /dev/spidev0.0 ]]; then
        if [[ -r /dev/spidev0.0 ]]; then
            echo -e "${GREEN}SPI access: OK${NC}"
        else
            echo -e "${YELLOW}Warning: No read access to /dev/spidev0.0${NC}"
            echo -e "${YELLOW}Run: sudo usermod -aG spi \$USER && logout/login${NC}"
        fi
    fi
}

cd "$PROJECT_ROOT"

# Handle different run modes
case $RUN_MODE in
    dev)
        echo -e "${BLUE}Mode: Development (Hot-Reload)${NC}"
        echo ""
        echo -e "${BLUE}Configuration:${NC}"
        echo -e "  Display:     $DISPLAY_TYPE"
        echo -e "  API URL:     ${API_BASE_URL:-not set}"
        echo -e "  Fullscreen:  ${TAURI_FULLSCREEN:-false}"
        echo -e "  Log Level:   $LOG_LEVEL"
        echo -e "  RFID:        ${VITE_ENABLE_RFID:-false}"

        check_hardware_access
        configure_display_rotation

        echo ""
        echo -e "${GREEN}Starting tauri dev...${NC}"
        echo -e "${YELLOW}Frontend changes will hot-reload automatically${NC}"
        echo -e "${YELLOW}Rust changes require restart${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""

        if [[ "$VITE_ENABLE_RFID" == "true" ]]; then
            exec npm run tauri dev -- --features rfid
        else
            exec npm run tauri dev
        fi
        ;;

    build)
        echo -e "${BLUE}Mode: Build + Run${NC}"
        echo -e "${BLUE}Building PyrePortal...${NC}"

        if [[ "$VITE_ENABLE_RFID" == "true" ]]; then
            echo -e "${GREEN}Building with RFID support${NC}"
            npm run tauri build -- --features rfid
        else
            echo -e "${YELLOW}Building without RFID support${NC}"
            npm run tauri build
        fi

        echo -e "${GREEN}Build complete!${NC}"

        # Fall through to run the binary
        ;&

    release)
        if [[ "$RUN_MODE" == "release" ]]; then
            echo -e "${BLUE}Mode: Release Binary${NC}"
        fi

        # Check if binary exists
        if [[ ! -f "$BINARY_PATH" ]]; then
            echo -e "${RED}Error: Binary not found at $BINARY_PATH${NC}"
            echo -e "${YELLOW}Run with --build flag or build manually first:${NC}"
            echo -e "  npm run tauri build -- --features rfid"
            exit 1
        fi

        echo ""
        echo -e "${BLUE}Configuration:${NC}"
        echo -e "  Binary:      $BINARY_PATH"
        echo -e "  Display:     $DISPLAY_TYPE"
        echo -e "  API URL:     ${API_BASE_URL:-not set}"
        echo -e "  Fullscreen:  ${TAURI_FULLSCREEN:-false}"
        echo -e "  Log Level:   $LOG_LEVEL"
        echo -e "  RFID:        ${VITE_ENABLE_RFID:-false}"

        check_hardware_access
        configure_display_rotation

        echo ""
        echo -e "${GREEN}Starting PyrePortal...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""

        exec "$BINARY_PATH"
        ;;
esac
