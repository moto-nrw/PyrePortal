#!/bin/bash

echo "Building and running RFID persistent test..."
echo "This initializes hardware ONCE then scans continuously"
echo ""

# Build the test binary
cd "$(dirname "$0")"
cargo build --bin rfid_test_persistent --release

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo "Build successful! Running test..."
    echo ""
    
    # Run with sudo for GPIO access
    sudo ./target/release/rfid_test_persistent
else
    echo "Build failed!"
    exit 1
fi