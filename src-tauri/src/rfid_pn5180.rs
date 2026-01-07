//! PN5180 NFC Reader implementation for ISO 15693 tags
//!
//! This module implements the RfidReader trait for the PN5180 NFC frontend.
//! It supports reading ISO 15693 (vicinity) tags at distances up to ~20cm.
//!
//! Reference: pyPN5180, ATrappmann/PN5180-Library, NXP AN12650

use crate::rfid_pn5180_defs::*;
use crate::rfid_trait::RfidReader;
use linux_embedded_hal::spidev::{SpiModeFlags, SpidevOptions};
use linux_embedded_hal::Spidev;
use rppal::gpio::{Gpio, InputPin, OutputPin};
use std::io::{Read, Write};
use std::thread;
use std::time::{Duration, Instant};

/// PN5180 RFID reader for ISO 15693 tags
pub struct Pn5180Reader {
    spi: Spidev,
    busy_pin: InputPin,
    reset_pin: OutputPin,
}

impl Pn5180Reader {
    /// Create and initialize a new PN5180 reader
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
        let gpio =
            Gpio::new().map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;

        let reset_pin = gpio
            .get(GPIO_RST.into())
            .map_err(|e| format!("Failed to get RST pin (GPIO {}): {:?}", GPIO_RST, e))?
            .into_output();

        let busy_pin = gpio
            .get(GPIO_BUSY.into())
            .map_err(|e| format!("Failed to get BUSY pin (GPIO {}): {:?}", GPIO_BUSY, e))?
            .into_input();

        println!(
            "✓ GPIO initialized (RST={}, BUSY={})",
            GPIO_RST, GPIO_BUSY
        );

        let mut reader = Self {
            spi,
            busy_pin,
            reset_pin,
        };

        // Perform hardware reset
        reader.hardware_reset()?;
        println!("✓ PN5180 reset complete");

        // Verify communication by reading product version
        let version = reader.read_eeprom(EEPROM_PRODUCT_VERSION, 2)?;
        println!(
            "✓ PN5180 product version: {:02X}.{:02X}",
            version[1], version[0]
        );

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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
        thread::sleep(Duration::from_millis(RF_STABILIZE_MS));
        Ok(())
    }

    fn rf_off(&mut self) -> Result<(), String> {
        self.send_command(CMD_RF_OFF, &[])
    }

    // === Data operations ===

    fn send_data(&mut self, data: &[u8]) -> Result<(), String> {
        // Clear IRQ status
        self.clear_irq_status()?;

        // Build frame with valid bits indicator
        // First byte: number of valid bits in last byte (0 = all 8 bits valid)
        let mut frame = vec![0x00];
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

    fn clear_irq_status(&mut self) -> Result<(), String> {
        // Write all 1s to IRQ_CLEAR register to clear all flags
        let data = [REG_IRQ_CLEAR, 0xFF, 0xFF, 0xFF, 0xFF];
        self.send_command(CMD_WRITE_REGISTER, &data)
    }

    fn hardware_reset(&mut self) -> Result<(), String> {
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
        self.clear_irq_status()?;

        Ok(())
    }

    // === ISO 15693 operations ===

    /// Perform ISO 15693 inventory to read tag UID
    fn inventory_iso15693(&mut self) -> Result<Option<String>, String> {
        // Load ISO 15693 RF configuration
        self.load_rf_config(RF_CONFIG_ISO15693_TX, RF_CONFIG_ISO15693_RX)?;

        // Turn on RF field
        self.rf_on()?;

        // Send inventory command: [flags, cmd, mask_length]
        let inventory_cmd = [ISO15693_INVENTORY_FLAGS, ISO15693_CMD_INVENTORY, 0x00];
        self.send_data(&inventory_cmd)?;

        // Wait for card to respond
        thread::sleep(Duration::from_millis(CARD_RESPONSE_MS));

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
        self.hardware_reset()
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
