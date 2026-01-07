#!/bin/bash
# Test PN5180 RFID reader hardware
# Run on Raspberry Pi with PN5180 connected
#
# Wiring:
#   RST  = GPIO 22 (Pin 15)
#   BUSY = GPIO 25 (Pin 22)
#   SPI  = /dev/spidev0.0 (MOSI=Pin19, MISO=Pin21, CLK=Pin23, CE0=Pin24)
#   3.3V = Pin 1
#   5V   = Pin 2 (for antenna)
#   GND  = Pin 6

set -e
cd "$(dirname "$0")"

echo "=== PN5180 Hardware Test ==="
echo ""
echo "Wiring check:"
echo "  RST  = GPIO 22"
echo "  BUSY = GPIO 25"
echo "  SPI  = /dev/spidev0.0"
echo "  3.3V = Pin 1 (logic)"
echo "  5V   = Pin 2 (antenna)"
echo ""

# Set reader type
export RFID_READER=pn5180

# Build the existing rfid_test example
echo "Building RFID test..."
cargo build --example rfid_test_persistent --features rfid

echo ""
echo "Running PN5180 test (place ISO 15693 tag on reader)..."
echo "Press Ctrl+C to exit"
echo ""

sudo -E RFID_READER=pn5180 ./target/debug/examples/rfid_test_persistent
