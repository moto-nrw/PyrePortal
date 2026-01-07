# PN5180 RFID Driver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PN5180 NFC reader support with runtime switching between MFRC522 and PN5180.

**Architecture:** Create `RfidReader` trait implemented by both readers. Factory function reads `RFID_READER` env var to instantiate correct implementation. Existing background service unchanged.

**Tech Stack:** Rust, rppal (GPIO/SPI), linux-embedded-hal, Tauri

**Design Doc:** `docs/plans/2026-01-07-pn5180-driver-design.md`

---

## Task 1: Create RfidReader Trait

**Files:**

- Create: `src-tauri/src/rfid_trait.rs`

**Step 1: Create the trait file**

```rust
// src-tauri/src/rfid_trait.rs

/// Common interface for RFID readers (MFRC522, PN5180)
pub trait RfidReader: Send {
    /// Perform a single scan attempt
    /// Returns Ok(Some(uid)) if tag found, Ok(None) if no tag, Err on hardware error
    fn scan(&mut self) -> Result<Option<String>, String>;

    /// Reset the reader hardware
    fn reset(&mut self) -> Result<(), String>;

    /// Get reader type name for logging
    fn reader_type(&self) -> &'static str;
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/rfid_trait.rs
git commit -m "feat(rfid): add RfidReader trait for hardware abstraction"
```

---

## Task 2: Create PN5180 Constants Module

**Files:**

- Create: `src-tauri/src/rfid_pn5180_defs.rs`

**Step 1: Create definitions file with all PN5180 constants**

```rust
// src-tauri/src/rfid_pn5180_defs.rs

//! PN5180 command codes, registers, and constants
//! Reference: NXP PN5180 Datasheet, pyPN5180 library

// === SPI Commands ===
pub const CMD_WRITE_REGISTER: u8 = 0x00;
pub const CMD_WRITE_REGISTER_OR_MASK: u8 = 0x01;
pub const CMD_WRITE_REGISTER_AND_MASK: u8 = 0x02;
pub const CMD_READ_REGISTER: u8 = 0x04;
pub const CMD_WRITE_EEPROM: u8 = 0x06;
pub const CMD_READ_EEPROM: u8 = 0x07;
pub const CMD_SEND_DATA: u8 = 0x09;
pub const CMD_READ_DATA: u8 = 0x0A;
pub const CMD_SWITCH_MODE: u8 = 0x0B;
pub const CMD_LOAD_RF_CONFIG: u8 = 0x11;
pub const CMD_RF_ON: u8 = 0x16;
pub const CMD_RF_OFF: u8 = 0x17;

// === Registers ===
pub const REG_SYSTEM_CONFIG: u8 = 0x00;
pub const REG_IRQ_ENABLE: u8 = 0x01;
pub const REG_IRQ_STATUS: u8 = 0x02;
pub const REG_IRQ_CLEAR: u8 = 0x03;
pub const REG_TRANSCEIVE_CONTROL: u8 = 0x04;
pub const REG_TIMER1_RELOAD: u8 = 0x0C;
pub const REG_TIMER1_CONFIG: u8 = 0x0F;
pub const REG_RX_WAIT_CONFIG: u8 = 0x11;
pub const REG_CRC_RX_CONFIG: u8 = 0x12;
pub const REG_RX_STATUS: u8 = 0x13;
pub const REG_CRC_TX_CONFIG: u8 = 0x19;
pub const REG_RF_STATUS: u8 = 0x1D;
pub const REG_SYSTEM_STATUS: u8 = 0x24;
pub const REG_TEMP_CONTROL: u8 = 0x25;

// === EEPROM Addresses ===
pub const EEPROM_DIE_IDENTIFIER: u8 = 0x00;
pub const EEPROM_PRODUCT_VERSION: u8 = 0x10;
pub const EEPROM_FIRMWARE_VERSION: u8 = 0x12;
pub const EEPROM_EEPROM_VERSION: u8 = 0x14;
pub const EEPROM_IRQ_PIN_CONFIG: u8 = 0x1A;

// === IRQ Status Bits ===
pub const IRQ_RX_DONE: u32 = 1 << 0;
pub const IRQ_TX_DONE: u32 = 1 << 1;
pub const IRQ_IDLE: u32 = 1 << 2;
pub const IRQ_RFOFF_DET: u32 = 1 << 6;
pub const IRQ_RFON_DET: u32 = 1 << 7;
pub const IRQ_GENERAL_ERROR: u32 = 1 << 17;

// === RF Configuration (ISO 15693) ===
pub const RF_CONFIG_ISO15693_TX: u8 = 0x0D;
pub const RF_CONFIG_ISO15693_RX: u8 = 0x8D;

// === ISO 15693 Inventory Command ===
pub const ISO15693_INVENTORY_FLAGS: u8 = 0x26;  // High data rate, single slot
pub const ISO15693_CMD_INVENTORY: u8 = 0x01;

// === GPIO Pins (BCM numbering) ===
pub const GPIO_RST: u8 = 22;
pub const GPIO_BUSY: u8 = 25;

// === Timing Constants ===
pub const RESET_PULSE_US: u64 = 50;
pub const RESET_STARTUP_MS: u64 = 2;
pub const BUSY_TIMEOUT_MS: u64 = 100;
pub const BUSY_POLL_US: u64 = 100;
```

**Step 2: Commit**

```bash
git add src-tauri/src/rfid_pn5180_defs.rs
git commit -m "feat(rfid): add PN5180 command and register definitions"
```

---

## Task 3: Create PN5180 Reader Implementation

**Files:**

- Create: `src-tauri/src/rfid_pn5180.rs`

**Step 1: Create the PN5180 reader struct and initialization**

```rust
// src-tauri/src/rfid_pn5180.rs

//! PN5180 NFC Reader implementation for ISO 15693 tags
//! Reference: pyPN5180, ATrappmann/PN5180-Library

use crate::rfid_pn5180_defs::*;
use crate::rfid_trait::RfidReader;
use linux_embedded_hal::spidev::{SpiModeFlags, SpidevOptions};
use linux_embedded_hal::Spidev;
use rppal::gpio::{Gpio, InputPin, OutputPin};
use std::io::{Read, Write};
use std::thread;
use std::time::{Duration, Instant};

pub struct Pn5180Reader {
    spi: Spidev,
    busy_pin: InputPin,
    reset_pin: OutputPin,
}

impl Pn5180Reader {
    pub fn new() -> Result<Self, String> {
        println!("Initializing PN5180 reader...");

        // Initialize SPI
        let mut spi = Spidev::open("/dev/spidev0.0")
            .map_err(|e| format!("Failed to open SPI: {:?}", e))?;

        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000) // 1MHz (conservative, max is 7MHz)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();

        spi.configure(&options)
            .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;
        println!("✓ SPI configured at 1MHz");

        // Initialize GPIO
        let gpio = Gpio::new()
            .map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;

        let reset_pin = gpio
            .get(GPIO_RST)
            .map_err(|e| format!("Failed to get RST pin (GPIO {}): {:?}", GPIO_RST, e))?
            .into_output();

        let busy_pin = gpio
            .get(GPIO_BUSY)
            .map_err(|e| format!("Failed to get BUSY pin (GPIO {}): {:?}", GPIO_BUSY, e))?
            .into_input();

        println!("✓ GPIO initialized (RST={}, BUSY={})", GPIO_RST, GPIO_BUSY);

        let mut reader = Self {
            spi,
            busy_pin,
            reset_pin,
        };

        // Perform hardware reset
        reader.reset()?;
        println!("✓ PN5180 reset complete");

        // Verify communication by reading product version
        let version = reader.read_eeprom(EEPROM_PRODUCT_VERSION, 2)?;
        println!("✓ PN5180 product version: {:02X}.{:02X}", version[1], version[0]);

        Ok(reader)
    }

    // === Low-level SPI operations ===

    /// Wait until BUSY pin goes LOW (chip ready)
    fn wait_busy(&self) -> Result<(), String> {
        let timeout = Duration::from_millis(BUSY_TIMEOUT_MS);
        let start = Instant::now();

        while self.busy_pin.is_high() {
            if start.elapsed() > timeout {
                return Err("PN5180 BUSY timeout".to_string());
            }
            thread::sleep(Duration::from_micros(BUSY_POLL_US));
        }
        Ok(())
    }

    /// Send command to PN5180
    fn send_command(&mut self, cmd: u8, data: &[u8]) -> Result<(), String> {
        self.wait_busy()?;

        let mut frame = vec![cmd];
        frame.extend_from_slice(data);

        self.spi
            .write(&frame)
            .map_err(|e| format!("SPI write failed: {:?}", e))?;

        Ok(())
    }

    /// Read response from PN5180
    fn read_response(&mut self, len: usize) -> Result<Vec<u8>, String> {
        self.wait_busy()?;

        let mut buffer = vec![0xFF; len];
        self.spi
            .read(&mut buffer)
            .map_err(|e| format!("SPI read failed: {:?}", e))?;

        Ok(buffer)
    }

    // === Register operations ===

    fn write_register(&mut self, reg: u8, value: u32) -> Result<(), String> {
        let data = [
            reg,
            (value & 0xFF) as u8,
            ((value >> 8) & 0xFF) as u8,
            ((value >> 16) & 0xFF) as u8,
            ((value >> 24) & 0xFF) as u8,
        ];
        self.send_command(CMD_WRITE_REGISTER, &data)
    }

    fn read_register(&mut self, reg: u8) -> Result<u32, String> {
        self.send_command(CMD_READ_REGISTER, &[reg])?;
        let data = self.read_response(4)?;
        Ok(u32::from_le_bytes([data[0], data[1], data[2], data[3]]))
    }

    fn write_register_or_mask(&mut self, reg: u8, mask: u32) -> Result<(), String> {
        let data = [
            reg,
            (mask & 0xFF) as u8,
            ((mask >> 8) & 0xFF) as u8,
            ((mask >> 16) & 0xFF) as u8,
            ((mask >> 24) & 0xFF) as u8,
        ];
        self.send_command(CMD_WRITE_REGISTER_OR_MASK, &data)
    }

    fn write_register_and_mask(&mut self, reg: u8, mask: u32) -> Result<(), String> {
        let data = [
            reg,
            (mask & 0xFF) as u8,
            ((mask >> 8) & 0xFF) as u8,
            ((mask >> 16) & 0xFF) as u8,
            ((mask >> 24) & 0xFF) as u8,
        ];
        self.send_command(CMD_WRITE_REGISTER_AND_MASK, &data)
    }

    // === EEPROM operations ===

    fn read_eeprom(&mut self, addr: u8, len: u8) -> Result<Vec<u8>, String> {
        self.send_command(CMD_READ_EEPROM, &[addr, len])?;
        self.read_response(len as usize)
    }

    // === RF operations ===

    fn load_rf_config(&mut self, tx_config: u8, rx_config: u8) -> Result<(), String> {
        self.send_command(CMD_LOAD_RF_CONFIG, &[tx_config, rx_config])
    }

    fn rf_on(&mut self) -> Result<(), String> {
        self.send_command(CMD_RF_ON, &[0x00])?;
        // Wait for RF field to stabilize
        thread::sleep(Duration::from_millis(5));
        Ok(())
    }

    fn rf_off(&mut self) -> Result<(), String> {
        self.send_command(CMD_RF_OFF, &[])
    }

    // === Data operations ===

    fn send_data(&mut self, data: &[u8]) -> Result<(), String> {
        // Clear IRQ status
        self.write_register(REG_IRQ_CLEAR, 0xFFFFFFFF)?;

        // Build frame with valid bits indicator
        let mut frame = vec![0x00]; // Number of valid bits in last byte (0 = all 8 bits valid)
        frame.extend_from_slice(data);

        self.send_command(CMD_SEND_DATA, &frame)?;

        // Wait for TX complete
        thread::sleep(Duration::from_millis(10));

        Ok(())
    }

    fn read_data(&mut self) -> Result<Vec<u8>, String> {
        // Check RX status for received bytes
        let rx_status = self.read_register(REG_RX_STATUS)?;
        let rx_bytes = (rx_status & 0x1FF) as usize;

        if rx_bytes == 0 {
            return Err("No data received".to_string());
        }

        self.send_command(CMD_READ_DATA, &[0x00])?;
        self.read_response(rx_bytes)
    }

    fn card_responded(&mut self) -> Result<bool, String> {
        let rx_status = self.read_register(REG_RX_STATUS)?;
        let rx_bytes = rx_status & 0x1FF;
        Ok(rx_bytes > 0)
    }

    // === ISO 15693 operations ===

    fn inventory_iso15693(&mut self) -> Result<Option<String>, String> {
        // Load ISO 15693 RF configuration
        self.load_rf_config(RF_CONFIG_ISO15693_TX, RF_CONFIG_ISO15693_RX)?;

        // Turn on RF field
        self.rf_on()?;

        // Send inventory command: [flags, cmd, mask_length]
        let inventory_cmd = [ISO15693_INVENTORY_FLAGS, ISO15693_CMD_INVENTORY, 0x00];
        self.send_data(&inventory_cmd)?;

        // Small delay for card to respond
        thread::sleep(Duration::from_millis(20));

        // Check if card responded
        if !self.card_responded()? {
            self.rf_off()?;
            return Ok(None);
        }

        // Read response: [flags, DSFID, UID (8 bytes)]
        let data = self.read_data()?;

        // Turn off RF
        self.rf_off()?;

        // Parse UID (bytes 2-9, LSB first)
        if data.len() < 10 {
            return Err(format!("Invalid response length: {}", data.len()));
        }

        // Format UID as hex string (reverse to MSB first for display)
        let uid: Vec<String> = data[2..10]
            .iter()
            .rev()
            .map(|b| format!("{:02X}", b))
            .collect();

        Ok(Some(uid.join(":")))
    }
}

impl RfidReader for Pn5180Reader {
    fn scan(&mut self) -> Result<Option<String>, String> {
        self.inventory_iso15693()
    }

    fn reset(&mut self) -> Result<(), String> {
        // Pull RST low
        self.reset_pin.set_low();
        thread::sleep(Duration::from_micros(RESET_PULSE_US));

        // Release RST
        self.reset_pin.set_high();

        // Wait for startup
        thread::sleep(Duration::from_millis(RESET_STARTUP_MS));

        // Wait for chip ready
        self.wait_busy()?;

        // Clear all IRQ flags
        self.write_register(REG_IRQ_CLEAR, 0xFFFFFFFF)?;

        Ok(())
    }

    fn reader_type(&self) -> &'static str {
        "PN5180 (ISO 15693)"
    }
}

impl Drop for Pn5180Reader {
    fn drop(&mut self) {
        // Best-effort: turn off RF field
        let _ = self.rf_off();
        println!("PN5180 reader dropped - RF field off");
    }
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/rfid_pn5180.rs
git commit -m "feat(rfid): implement PN5180 reader with ISO 15693 inventory"
```

---

## Task 4: Extract MFRC522 to Separate Module

**Files:**

- Create: `src-tauri/src/rfid_mfrc522.rs`
- Modify: `src-tauri/src/rfid.rs`

**Step 1: Create MFRC522 wrapper that implements RfidReader trait**

```rust
// src-tauri/src/rfid_mfrc522.rs

//! MFRC522 RFID Reader wrapper implementing RfidReader trait

use crate::rfid_trait::RfidReader;
use linux_embedded_hal::spidev::{SpiModeFlags, SpidevOptions};
use linux_embedded_hal::Spidev;
use mfrc522::comm::eh02::spi::{DummyDelay, DummyNSS, SpiInterface};
use mfrc522::{Mfrc522, RxGain};
use rppal::gpio::Gpio;
use std::thread;
use std::time::Duration;

const GPIO_RST: u8 = 22;

type Mfrc522Scanner = Mfrc522<SpiInterface<Spidev, DummyNSS, DummyDelay>, mfrc522::Initialized>;

pub struct Mfrc522Reader {
    mfrc522: Mfrc522Scanner,
}

impl Mfrc522Reader {
    pub fn new() -> Result<Self, String> {
        println!("Initializing MFRC522 reader...");

        // Initialize SPI
        let mut spi = Spidev::open("/dev/spidev0.0")
            .map_err(|e| format!("Failed to open SPI: {:?}", e))?;

        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();

        spi.configure(&options)
            .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;
        println!("✓ SPI configured at 1MHz");

        // Setup GPIO for reset
        let gpio = Gpio::new()
            .map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;

        let mut reset_pin = gpio
            .get(GPIO_RST)
            .map_err(|e| format!("Failed to get RST pin: {:?}", e))?
            .into_output();

        // Hardware reset
        reset_pin.set_high();
        reset_pin.set_low();
        thread::sleep(Duration::from_millis(50));
        reset_pin.set_high();
        thread::sleep(Duration::from_millis(50));
        println!("✓ Hardware reset complete");

        // Initialize MFRC522
        let spi_interface = SpiInterface::new(spi);
        let mfrc522 = Mfrc522::new(spi_interface);
        let mut mfrc522 = mfrc522
            .init()
            .map_err(|e| format!("Failed to initialize MFRC522: {:?}", e))?;
        println!("✓ MFRC522 initialized");

        // Verify version
        if let Ok(v) = mfrc522.version() {
            println!("✓ MFRC522 version: 0x{:02X}", v);
        }

        // Set antenna gain to maximum
        mfrc522
            .set_antenna_gain(RxGain::DB48)
            .map_err(|e| format!("Failed to set antenna gain: {:?}", e))?;
        println!("✓ Antenna gain: DB48 (maximum)");

        Ok(Self { mfrc522 })
    }

    fn format_uid(bytes: &[u8]) -> String {
        bytes
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(":")
    }
}

impl RfidReader for Mfrc522Reader {
    fn scan(&mut self) -> Result<Option<String>, String> {
        // Try WUPA (Wake-Up command)
        match self.mfrc522.wupa() {
            Ok(atqa) => {
                // Card detected, try to select it
                match self.mfrc522.select(&atqa) {
                    Ok(uid) => {
                        let _ = self.mfrc522.hlta();
                        Ok(Some(Self::format_uid(uid.as_bytes())))
                    }
                    Err(e) => {
                        let _ = self.mfrc522.hlta();
                        Err(format!("Select failed: {:?}", e))
                    }
                }
            }
            Err(_) => {
                // No card present
                Ok(None)
            }
        }
    }

    fn reset(&mut self) -> Result<(), String> {
        // MFRC522 crate doesn't expose reset, use HLTA to put card in halt state
        let _ = self.mfrc522.hlta();
        Ok(())
    }

    fn reader_type(&self) -> &'static str {
        "MFRC522 (ISO 14443)"
    }
}

impl Drop for Mfrc522Reader {
    fn drop(&mut self) {
        let _ = self.mfrc522.hlta();
        println!("MFRC522 reader dropped");
    }
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/rfid_mfrc522.rs
git commit -m "feat(rfid): extract MFRC522 reader implementing RfidReader trait"
```

---

## Task 5: Update rfid.rs with Reader Factory

**Files:**

- Modify: `src-tauri/src/rfid.rs`

**Step 1: Add module imports and factory function to rfid.rs**

At the top of `rfid.rs`, after the existing imports, add:

```rust
// Add after existing imports
mod rfid_trait;
mod rfid_mfrc522;
mod rfid_pn5180;

use rfid_trait::RfidReader;
```

**Step 2: Add factory function**

Add this function before `PersistentRfidScanner`:

```rust
/// Create RFID reader based on RFID_READER environment variable
/// Defaults to "mfrc522" if not set
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
fn create_reader() -> Result<Box<dyn RfidReader>, String> {
    let reader_type = std::env::var("RFID_READER")
        .unwrap_or_else(|_| "mfrc522".to_string());

    println!("Creating RFID reader: {}", reader_type);

    match reader_type.to_lowercase().as_str() {
        "pn5180" => {
            let reader = rfid_pn5180::Pn5180Reader::new()?;
            Ok(Box::new(reader))
        }
        "mfrc522" | _ => {
            let reader = rfid_mfrc522::Mfrc522Reader::new()?;
            Ok(Box::new(reader))
        }
    }
}
```

**Step 3: Update PersistentRfidScanner to use trait**

Replace the existing `PersistentRfidScanner` struct and its implementation in `raspberry_pi` module.

**Step 4: Commit**

```bash
git add src-tauri/src/rfid.rs
git commit -m "feat(rfid): add reader factory with RFID_READER env selection"
```

---

## Task 6: Register New Modules in lib.rs

**Files:**

- Modify: `src-tauri/src/lib.rs`

**Step 1: Add module declarations**

The modules are private to rfid.rs, so no changes needed in lib.rs. The `mod` declarations in rfid.rs handle this.

However, we need to ensure the modules are compiled. Update rfid.rs to properly declare submodules.

**Step 2: Update rfid.rs module structure**

At the very top of `src-tauri/src/rfid.rs`:

```rust
// Module declarations (must be at top)
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod rfid_pn5180_defs;
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod rfid_pn5180;
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod rfid_mfrc522;
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod rfid_trait;

// Then existing imports...
use serde::{Deserialize, Serialize};
// ...
```

**Step 3: Commit**

```bash
git add src-tauri/src/rfid.rs
git commit -m "chore(rfid): register PN5180 modules with conditional compilation"
```

---

## Task 7: Update .env.example

**Files:**

- Modify: `.env.example`

**Step 1: Add RFID_READER variable**

Add to `.env.example`:

```bash
# RFID Reader Selection
# Options: "mfrc522" (default), "pn5180"
RFID_READER=mfrc522
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add RFID_READER env variable to .env.example"
```

---

## Task 8: Create PN5180 Test Script

**Files:**

- Create: `src-tauri/test_pn5180.sh`

**Step 1: Create test script**

```bash
#!/bin/bash
# Test PN5180 RFID reader hardware
# Run on Raspberry Pi with PN5180 connected

set -e
cd "$(dirname "$0")"

echo "=== PN5180 Hardware Test ==="
echo ""

# Set reader type
export RFID_READER=pn5180

# Build and run the existing rfid_test example
echo "Building RFID test..."
cargo build --example rfid_test --features rfid

echo ""
echo "Running PN5180 test (place ISO 15693 tag on reader)..."
echo "Press Ctrl+C to exit"
echo ""

sudo -E ./target/debug/examples/rfid_test
```

**Step 2: Make executable and commit**

```bash
chmod +x src-tauri/test_pn5180.sh
git add src-tauri/test_pn5180.sh
git commit -m "test: add PN5180 hardware test script"
```

---

## Task 9: Integration - Update PersistentRfidScanner

**Files:**

- Modify: `src-tauri/src/rfid.rs`

**Step 1: Update PersistentRfidScanner struct**

In the `raspberry_pi` module, replace the existing `PersistentRfidScanner`:

```rust
// Inside raspberry_pi module

pub struct PersistentRfidScanner {
    reader: Box<dyn RfidReader>,
}

pub fn initialize_persistent_scanner() -> Result<PersistentRfidScanner, String> {
    let reader = super::create_reader()?;
    println!("RFID scanner initialized: {}", reader.reader_type());
    Ok(PersistentRfidScanner { reader })
}

pub fn scan_with_persistent_scanner_sync(
    scanner: &mut PersistentRfidScanner,
) -> Result<String, String> {
    match scanner.reader.scan()? {
        Some(uid) => Ok(uid),
        None => Err("No card detected".to_string()),
    }
}
```

**Step 2: Remove old MFRC522-specific code from raspberry_pi module**

The old direct MFRC522 code can be removed since it's now in `rfid_mfrc522.rs`.

**Step 3: Commit**

```bash
git add src-tauri/src/rfid.rs
git commit -m "feat(rfid): integrate RfidReader trait into background service"
```

---

## Task 10: Final Verification & Cleanup

**Step 1: Run cargo check**

```bash
cd src-tauri
cargo check --features rfid
```

Expected: No errors

**Step 2: Run cargo clippy**

```bash
cargo clippy --features rfid
```

Expected: No warnings (or only minor ones)

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(rfid): cleanup and verify PN5180 integration"
```

---

## Summary

| Task | Description               | Files                 |
| ---- | ------------------------- | --------------------- |
| 1    | Create RfidReader trait   | `rfid_trait.rs`       |
| 2    | Create PN5180 constants   | `rfid_pn5180_defs.rs` |
| 3    | Implement PN5180 reader   | `rfid_pn5180.rs`      |
| 4    | Extract MFRC522 to module | `rfid_mfrc522.rs`     |
| 5    | Add reader factory        | `rfid.rs`             |
| 6    | Register modules          | `rfid.rs`             |
| 7    | Update .env.example       | `.env.example`        |
| 8    | Create test script        | `test_pn5180.sh`      |
| 9    | Integrate with service    | `rfid.rs`             |
| 10   | Verify and cleanup        | -                     |

**Total: ~10 commits, ~500 lines of new code**
