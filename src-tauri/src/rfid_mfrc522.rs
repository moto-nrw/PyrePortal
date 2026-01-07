//! MFRC522 RFID Reader wrapper implementing RfidReader trait
//!
//! This module wraps the existing mfrc522 crate to implement the common
//! RfidReader trait, allowing runtime selection between MFRC522 and PN5180.

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

/// MFRC522 RFID reader for ISO 14443 tags
pub struct Mfrc522Reader {
    mfrc522: Mfrc522Scanner,
}

impl Mfrc522Reader {
    /// Create and initialize a new MFRC522 reader
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
        let gpio =
            Gpio::new().map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;

        let mut reset_pin = gpio
            .get(GPIO_RST.into())
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

    /// Format UID bytes as colon-separated hex string
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
