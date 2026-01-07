# PN5180 RFID Driver MVP Design

**Date:** 2026-01-07
**Status:** Approved
**Author:** Claude + User

## Overview

Add PN5180 NFC reader support to PyrePortal for ISO/IEC 15693 RFID tags, while maintaining backwards compatibility with existing MFRC522 (ISO 14443) hardware.

### Goals

- Support PN5180 module for ISO 15693 (vicinity, ~20cm range)
- Runtime switching between MFRC522 and PN5180 via env variable
- No frontend changes required
- Minimal code changes (~450 new lines)

### Non-Goals (MVP)

- Card emulation
- Write operations
- ISO 14443 on PN5180 (use MFRC522 for that)
- Publishing as standalone crate (future)

## Hardware Requirements

### PN5180 Wiring (9 wires total)

| Signal   | GPIO (BCM) | Physical Pin | Notes                   |
| -------- | ---------- | ------------ | ----------------------- |
| SPI MOSI | GPIO10     | Pin 19       | Same as MFRC522         |
| SPI MISO | GPIO9      | Pin 21       | Same as MFRC522         |
| SPI CLK  | GPIO11     | Pin 23       | Same as MFRC522         |
| SPI CE0  | GPIO8      | Pin 24       | Same as MFRC522         |
| RST      | GPIO22     | Pin 15       | Same as MFRC522         |
| **BUSY** | **GPIO25** | **Pin 22**   | **NEW**                 |
| 3.3V     | -          | Pin 1        | Logic power             |
| **5V**   | -          | **Pin 2**    | **NEW** - Antenna power |
| GND      | -          | Pin 6        | Ground                  |

### Comparison with MFRC522

| Aspect   | MFRC522    | PN5180               |
| -------- | ---------- | -------------------- |
| Protocol | ISO 14443  | ISO 15693            |
| Range    | ~3cm       | ~20cm                |
| Wires    | 7          | 9 (+BUSY, +5V)       |
| BUSY pin | Not needed | Required             |
| 5V power | Not needed | Required for antenna |

## Architecture

### Module Structure

```
src-tauri/src/
├── lib.rs                 # Existing - unchanged
├── rfid.rs                # Modified - add trait + dispatcher
├── rfid_mfrc522.rs        # NEW - extracted MFRC522 code
└── rfid_pn5180.rs         # NEW - PN5180 implementation
```

### Trait Definition

```rust
// rfid.rs
pub trait RfidReader: Send {
    fn scan(&mut self) -> Result<Option<String>, String>;
    fn reset(&mut self) -> Result<(), String>;
}
```

### Reader Selection

```rust
// rfid.rs
fn create_reader() -> Result<Box<dyn RfidReader>, String> {
    let reader_type = std::env::var("RFID_READER")
        .unwrap_or_else(|_| "mfrc522".to_string());

    match reader_type.to_lowercase().as_str() {
        "pn5180" => Ok(Box::new(Pn5180Reader::new()?)),
        _ => Ok(Box::new(Mfrc522Reader::new()?)),
    }
}
```

## PN5180 Implementation

### Constants

```rust
// Commands
const CMD_WRITE_REGISTER: u8 = 0x00;
const CMD_WRITE_REGISTER_OR_MASK: u8 = 0x01;
const CMD_WRITE_REGISTER_AND_MASK: u8 = 0x02;
const CMD_READ_REGISTER: u8 = 0x04;
const CMD_SEND_DATA: u8 = 0x09;
const CMD_READ_DATA: u8 = 0x0A;
const CMD_LOAD_RF_CONFIG: u8 = 0x11;
const CMD_RF_ON: u8 = 0x16;
const CMD_RF_OFF: u8 = 0x17;

// Registers
const REG_IRQ_STATUS: u8 = 0x02;
const REG_IRQ_CLEAR: u8 = 0x03;
const REG_RX_STATUS: u8 = 0x13;

// GPIO
const GPIO_RST: u8 = 22;
const GPIO_BUSY: u8 = 25;
```

### Core Struct

```rust
pub struct Pn5180Reader {
    spi: Spidev,
    busy_pin: InputPin,
    reset_pin: OutputPin,
}
```

### BUSY Pin Protocol

```rust
fn wait_busy(&self) -> Result<(), String> {
    let timeout = Duration::from_millis(100);
    let start = Instant::now();

    while self.busy_pin.is_high() {
        if start.elapsed() > timeout {
            return Err("PN5180 BUSY timeout".to_string());
        }
        thread::sleep(Duration::from_micros(100));
    }
    Ok(())
}

fn send_command(&mut self, cmd: u8, data: &[u8]) -> Result<(), String> {
    self.wait_busy()?;

    let mut frame = vec![cmd];
    frame.extend_from_slice(data);

    self.spi.write(&frame)
        .map_err(|e| format!("SPI write failed: {}", e))?;

    self.wait_busy()?;
    Ok(())
}
```

### ISO 15693 Inventory

```rust
pub fn inventory_iso15693(&mut self) -> Result<Option<String>, String> {
    // 1. Load ISO 15693 RF config
    self.load_rf_config(0x0D, 0x8D)?;

    // 2. Turn on RF field
    self.rf_on()?;

    // 3. Send inventory command
    self.send_data(&[0x26, 0x01, 0x00])?;

    // 4. Check if card responded
    if !self.card_responded()? {
        self.rf_off()?;
        return Ok(None);
    }

    // 5. Read UID (8 bytes, LSB first)
    let data = self.read_data()?;
    let uid = self.format_uid(&data[2..10])?;

    // 6. Turn off RF
    self.rf_off()?;

    Ok(Some(uid))
}
```

### Reset Sequence

```rust
fn reset(&mut self) -> Result<(), String> {
    self.reset_pin.set_low();
    thread::sleep(Duration::from_micros(50));
    self.reset_pin.set_high();
    thread::sleep(Duration::from_millis(2));
    self.wait_busy()?;
    Ok(())
}
```

## Configuration

### Environment Variables

```bash
# .env
RFID_READER=mfrc522          # or "pn5180"
RFID_GPIO_RST=22             # Optional override
RFID_GPIO_BUSY=25            # PN5180 only
```

### Cargo.toml

No new dependencies required. Existing deps work for both:

```toml
[target.'cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))'.dependencies]
mfrc522 = { version = "0.8.0", features = ["eh02"], optional = true }
rppal = { version = "0.22.1", optional = true }
embedded-hal = { version = "0.2.7", optional = true }
linux-embedded-hal = { version = "0.3.2", optional = true }
```

## UID Format

Both readers return hex string format, variable length:

| Protocol            | Length    | Example                   |
| ------------------- | --------- | ------------------------- |
| ISO 14443 (MFRC522) | 4-7 bytes | `04:D6:94:82:97:6A:80`    |
| ISO 15693 (PN5180)  | 8 bytes   | `E0:04:01:50:12:34:56:78` |

Frontend handles both without changes.

## Files Changed

| File                            | Action        | Lines |
| ------------------------------- | ------------- | ----- |
| `src-tauri/src/rfid_pn5180.rs`  | NEW           | ~250  |
| `src-tauri/src/rfid_mfrc522.rs` | NEW (extract) | ~150  |
| `src-tauri/src/rfid.rs`         | MODIFY        | ~50   |
| `src-tauri/Cargo.toml`          | MODIFY        | ~2    |
| `.env.example`                  | MODIFY        | ~3    |
| `src-tauri/test_pn5180.sh`      | NEW           | ~20   |

**Total: ~450 new lines**

## Testing Plan

### 1. Hardware Validation

```bash
# Test PN5180 communication (no tags)
cd src-tauri
./test_pn5180.sh
# Expected: Chip version printed
```

### 2. Tag Reading

```bash
# Test with ISO 15693 tag
RFID_READER=pn5180 cargo run --example rfid_test
# Expected: UID printed
```

### 3. Fallback Test

```bash
# Verify MFRC522 still works
RFID_READER=mfrc522 cargo run --example rfid_test
```

### 4. Integration Test

```bash
# Full app with PN5180
cd /path/to/PyrePortal
RFID_READER=pn5180 npm run tauri dev
```

## References

- [NXP PN5180 Datasheet](https://www.nxp.com/docs/en/data-sheet/PN5180A0XX-C1-C2.pdf)
- [NXP AN12650 - Using PN5180 without library](https://www.nxp.com/docs/en/application-note/AN12650.pdf)
- [pyPN5180 - Python reference](https://github.com/fservida/pyPN5180)
- [ATrappmann/PN5180-Library - Arduino reference](https://github.com/ATrappmann/PN5180-Library)

## Risks

| Risk               | Mitigation                                             |
| ------------------ | ------------------------------------------------------ |
| BUSY timing issues | Start with conservative delays, tune on hardware       |
| No Rust reference  | Use Python/Arduino libs as guide                       |
| Hardware debugging | Test incrementally: reset → registers → RF → inventory |

## Future Improvements

- Publish as standalone `pn5180` crate
- Add ISO 14443 support on PN5180
- Auto-detect reader type
- Multi-slot inventory (multiple tags)
