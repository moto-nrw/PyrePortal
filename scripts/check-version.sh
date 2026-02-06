#!/bin/bash
# Pre-release version check: ensures package.json, Cargo.toml, tauri.conf.json
# and the planned git tag are all in sync.
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# Read versions from all 3 sources
NPM_VERSION=$(node -p "require('./package.json').version")
CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
TAURI_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version")

echo "=== PyrePortal Version Check ==="
echo ""
echo "  package.json:      ${NPM_VERSION}"
echo "  Cargo.toml:        ${CARGO_VERSION}"
echo "  tauri.conf.json:   ${TAURI_VERSION}"

# Check all 3 match
if [ "$NPM_VERSION" = "$CARGO_VERSION" ] && [ "$CARGO_VERSION" = "$TAURI_VERSION" ]; then
    echo -e "  Sync:              ${GREEN}All match${NC}"
else
    echo -e "  Sync:              ${RED}MISMATCH${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check against latest GitHub release
echo ""
LATEST_TAG=$(gh release list --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null || echo "")

if [ -z "$LATEST_TAG" ]; then
    echo -e "  ${YELLOW}Could not fetch GitHub releases (offline or no gh auth)${NC}"
else
    LATEST_VERSION="${LATEST_TAG#v}"
    echo "  Latest GH release: ${LATEST_TAG}"

    if [ "$NPM_VERSION" = "$LATEST_VERSION" ]; then
        echo -e "  ${RED}ERROR: Branch version (${NPM_VERSION}) equals latest release (${LATEST_TAG})${NC}"
        echo -e "  ${RED}Version must be greater than latest release. Bump before releasing.${NC}"
        ERRORS=$((ERRORS + 1))
    else
        # Simple string comparison — works for semver with same segment count
        if [ "$(printf '%s\n' "$LATEST_VERSION" "$NPM_VERSION" | sort -V | tail -1)" = "$NPM_VERSION" ]; then
            echo -e "  vs. branch:        ${GREEN}${NPM_VERSION} > ${LATEST_VERSION}${NC}"
        else
            echo -e "  vs. branch:        ${RED}${NPM_VERSION} is OLDER than ${LATEST_TAG}${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}FAILED: Fix version issues before releasing.${NC}"
    exit 1
else
    echo -e "${GREEN}OK: Ready to release v${NPM_VERSION}${NC}"
    exit 0
fi
