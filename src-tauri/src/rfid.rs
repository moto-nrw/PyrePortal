use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct RfidScanResult {
    pub success: bool,
    pub tag_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RfidScannerStatus {
    pub is_available: bool,
    pub platform: String,
    pub last_error: Option<String>,
}

// Platform-specific RFID implementation for Raspberry Pi
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod raspberry_pi {
    use super::*;
    use linux_embedded_hal::{
        spidev::{SpidevOptions, SpiModeFlags},
        Spidev,
    };
    use mfrc522::{
        Mfrc522, 
        comm::eh02::spi::SpiInterface,
    };
    use rppal::gpio::Gpio;
    use std::{thread, error::Error, fmt};

    // Custom error type matching the original implementation
    #[derive(Debug)]
    enum RfidError {
        DeviceError(String),
        IoError(std::io::Error),
    }

    impl fmt::Display for RfidError {
        fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
            match self {
                RfidError::DeviceError(s) => write!(f, "Device error: {}", s),
                RfidError::IoError(e) => write!(f, "IO error: {}", e),
            }
        }
    }

    impl Error for RfidError {}

    impl From<std::io::Error> for RfidError {
        fn from(error: std::io::Error) -> Self {
            RfidError::IoError(error)
        }
    }

    impl From<String> for RfidError {
        fn from(error: String) -> Self {
            RfidError::DeviceError(error)
        }
    }

    impl From<&str> for RfidError {
        fn from(error: &str) -> Self {
            RfidError::DeviceError(error.to_string())
        }
    }

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        // Initialize SPI device - matches Python implementation settings
        let mut spi = match Spidev::open("/dev/spidev0.0") {
            Ok(s) => s,
            Err(e) => {
                return Err(format!("Failed to open SPI device 0.0: {:?}", e));
            }
        };
        
        // SPI configuration - match Python speed of 1MHz
        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();
        
        if let Err(e) = spi.configure(&options) {
            return Err(format!("Failed to configure SPI: {:?}", e));
        }
        
        // Setup GPIO - Python uses BCM 22 (physical pin 15)
        let gpio = match Gpio::new() {
            Ok(g) => g,
            Err(e) => return Err(format!("Failed to initialize GPIO: {:?}", e)),
        };
        
        let reset_pin_number = 22; // Matches Python default value
        let mut reset_pin = match gpio.get(reset_pin_number) {
            Ok(pin) => pin.into_output(),
            Err(e) => return Err(format!("Failed to setup reset pin on GPIO {}: {:?}", reset_pin_number, e)),
        };
        
        // Initialize with reset HIGH (Python does this)
        reset_pin.set_high();
        
        // Perform hardware reset (Python does MFRC522_Reset)
        reset_pin.set_low();
        thread::sleep(Duration::from_millis(50));
        reset_pin.set_high();
        thread::sleep(Duration::from_millis(50));
        
        // Create an interface for the MFRC522
        let spi_interface = SpiInterface::new(spi);
        
        // Create MFRC522 instance with proper initialization
        let mfrc522 = Mfrc522::new(spi_interface);
        
        // Initialize the MFRC522 (this transitions to the Initialized state)
        println!("Attempting to initialize MFRC522...");
        let mut mfrc522 = match mfrc522.init() {
            Ok(m) => {
                println!("MFRC522 initialized successfully");
                m
            },
            Err(e) => {
                println!("Failed to initialize MFRC522: {:?}", e);
                return Err(format!("Failed to initialize MFRC522: {:?}", e));
            }
        };
        
        // Try to read version to verify communication
        println!("Reading MFRC522 version...");
        let _version = match mfrc522.version() {
            Ok(v) => {
                println!("MFRC522 version: {:?}", v);
                v
            },
            Err(e) => {
                println!("Failed to read MFRC522 version: {:?}", e);
                return Err(format!("Failed to read MFRC522 version: {:?}", e));
            }
        };
        
        // Scan for cards with timeout (max 10 seconds)
        let start_time = std::time::Instant::now();
        let timeout = Duration::from_secs(10);
        
        loop {
            // Check for timeout
            if start_time.elapsed() > timeout {
                return Err("Scan timeout - no card detected within 10 seconds".to_string());
            }
            
            // Request card
            if let Ok(atqa) = mfrc522.reqa() {
                // Select card
                if let Ok(uid) = mfrc522.select(&atqa) {
                    // Convert UID bytes to hex string
                    let uid_bytes = uid.as_bytes();
                    let uid_hex: Vec<String> = uid_bytes.iter()
                        .map(|b| format!("{:02X}", b))
                        .collect();
                    
                    // Go back to idle state
                    let _ = mfrc522.hlta();
                    
                    return Ok(uid_hex.join(":"));
                }
            }
            
            // Sleep a bit before next check (like Python)
            thread::sleep(Duration::from_millis(100));
        }
    }

    pub fn check_rfid_hardware() -> RfidScannerStatus {
        // Check if SPI device exists
        let spi_available = std::path::Path::new("/dev/spidev0.0").exists();
        println!("SPI device /dev/spidev0.0 available: {}", spi_available);
        
        // Check if GPIO is accessible
        let gpio_result = Gpio::new();
        let gpio_available = gpio_result.is_ok();
        println!("GPIO access available: {}", gpio_available);
        if let Err(ref e) = gpio_result {
            println!("GPIO error: {:?}", e);
        }
        
        RfidScannerStatus {
            is_available: spi_available && gpio_available,
            platform: "Raspberry Pi (ARM64)".to_string(),
            last_error: if !spi_available {
                Some("SPI device /dev/spidev0.0 not found".to_string())
            } else if !gpio_available {
                Some("GPIO access failed".to_string())
            } else {
                None
            },
        }
    }
}

// Mock implementation for development platforms (MacBook, etc.)
#[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
mod mock_platform {
    use super::*;

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        // Simulate scanning delay
        tokio::time::sleep(Duration::from_millis(2000)).await;
        
        // Return mock tag ID
        Ok("MOCK:12:34:56:78".to_string())
    }

    pub fn check_rfid_hardware() -> RfidScannerStatus {
        RfidScannerStatus {
            is_available: true, // Mock is always "available"
            platform: format!("Development Platform ({})", std::env::consts::ARCH),
            last_error: None,
        }
    }
}

// Tauri commands that use the platform-specific implementations
#[tauri::command]
pub async fn scan_rfid_single() -> Result<RfidScanResult, String> {
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        match raspberry_pi::scan_rfid_hardware().await {
            Ok(tag_id) => Ok(RfidScanResult {
                success: true,
                tag_id: Some(tag_id),
                error: None,
            }),
            Err(error) => Ok(RfidScanResult {
                success: false,
                tag_id: None,
                error: Some(error),
            }),
        }
    }
    
    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    {
        match mock_platform::scan_rfid_hardware().await {
            Ok(tag_id) => Ok(RfidScanResult {
                success: true,
                tag_id: Some(tag_id),
                error: None,
            }),
            Err(error) => Ok(RfidScanResult {
                success: false,
                tag_id: None,
                error: Some(error),
            }),
        }
    }
}

#[tauri::command]
pub async fn get_rfid_scanner_status() -> Result<RfidScannerStatus, String> {
    println!("get_rfid_scanner_status called!");
    
    // Debug: Check what platform we're on
    println!("Target arch: {}", std::env::consts::ARCH);
    println!("Target OS: {}", std::env::consts::OS);
    
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        println!("Using Raspberry Pi platform");
        return Ok(raspberry_pi::check_rfid_hardware());
    }
    
    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    {
        println!("Using mock platform (not ARM64 Linux)");
        return Ok(mock_platform::check_rfid_hardware());
    }
}

#[tauri::command]
pub async fn scan_rfid_with_timeout(_timeout_seconds: u64) -> Result<RfidScanResult, String> {
    // For future implementation - continuous scanning with custom timeout
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        // TODO: Implement timeout-based scanning
        raspberry_pi::scan_rfid_hardware().await.map(|tag_id| RfidScanResult {
            success: true,
            tag_id: Some(tag_id),
            error: None,
        }).or_else(|error| Ok(RfidScanResult {
            success: false,
            tag_id: None,
            error: Some(error),
        }))
    }
    
    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    {
        tokio::time::sleep(Duration::from_secs(std::cmp::min(timeout_seconds, 5))).await;
        Ok(RfidScanResult {
            success: true,
            tag_id: Some(format!("MOCK:TIMEOUT:{}:SEC", timeout_seconds)),
            error: None,
        })
    }
}