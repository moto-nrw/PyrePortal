#!/bin/bash

echo "Building and running RFID test program..."
echo "This will test with 4MHz SPI speed and extensive logging"
echo ""

# Build the test binary with RFID feature
cd "$(dirname "$0")"
cargo build --bin rfid_test --release --features rfid

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo "Build successful! Running test..."
    echo ""
    
    # Run with sudo for GPIO access
    sudo ./target/release/rfid_test
else
    echo "Build failed!"
    exit 1
fi