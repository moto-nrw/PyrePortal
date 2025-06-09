use linux_embedded_hal::{
    spidev::{SpidevOptions, SpiModeFlags},
    Spidev,
};
use mfrc522::{
    Mfrc522, 
    comm::eh02::spi::SpiInterface,
};
use rppal::gpio::{Gpio};
use std::{thread, time::Duration, error::Error};
use std::io;
use std::fmt;

// Custom error type
#[derive(Debug)]
enum RfidError {
    DeviceError(String),
    IoError(io::Error),
    CardError,
}

impl fmt::Display for RfidError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            RfidError::DeviceError(s) => write!(f, "Device error: {}", s),
            RfidError::IoError(e) => write!(f, "IO error: {}", e),
            RfidError::CardError => write!(f, "Card error"),
        }
    }
}

impl Error for RfidError {}

impl From<io::Error> for RfidError {
    fn from(error: io::Error) -> Self {
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

fn main() -> Result<(), Box<dyn Error>> {
    // Match Python implementation settings
    println!("Starting RFID scanner...");
    
    // Open SPI device - Python uses SPI bus 0, device 0
    let mut spi = match Spidev::open("/dev/spidev0.0") {
        Ok(s) => {
            println!("Successfully opened SPI device 0.0");
            s
        },
        Err(e) => {
            println!("Failed to open SPI device 0.0: {:?}", e);
            return Err(Box::new(RfidError::from(e)));
        }
    };
    
    // SPI configuration - match Python speed of 1MHz
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(1_000_000)
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();
    
    println!("Configuring SPI device...");
    spi.configure(&options)?;
    
    // Setup GPIO - Python uses BCM 22 (physical pin 15)
    // Get the GPIO pin that the MFRC522 reset pin is connected to
    let gpio = Gpio::new()?;
    let reset_pin_number = 22; // Matches Python default value
    
    println!("Setting up reset pin on GPIO {}", reset_pin_number);
    let mut reset_pin = gpio.get(reset_pin_number)?.into_output();
    
    // Initialize with reset HIGH (Python does this)
    reset_pin.set_high();
    
    // Perform hardware reset (Python does MFRC522_Reset)
    println!("Performing hardware reset...");
    reset_pin.set_low();
    thread::sleep(Duration::from_millis(50));
    reset_pin.set_high();
    thread::sleep(Duration::from_millis(50));
    
    // Create an interface for the MFRC522
    println!("Setting up SPI interface...");
    let spi_interface = SpiInterface::new(spi);
    
    // Create MFRC522 instance with proper initialization
    println!("Creating MFRC522 instance...");
    let mfrc522 = Mfrc522::new(spi_interface);
    
    // Initialize the MFRC522 (this transitions to the Initialized state)
    println!("Initializing MFRC522...");
    let mut mfrc522 = match mfrc522.init() {
        Ok(m) => m,
        Err(e) => {
            println!("Failed to initialize MFRC522: {:?}", e);
            return Err("Failed to initialize MFRC522".into());
        }
    };
    
    // Try to read version to verify communication
    println!("Reading MFRC522 version...");
    let version = match mfrc522.version() {
        Ok(v) => {
            println!("MFRC522 Initialization successful! Version: {:x}", v);
            v
        },
        Err(e) => {
            println!("Failed to read version: {:?}", e);
            return Err("Failed to read MFRC522 version".into());
        }
    };
    
    println!("RFID Scanner Ready - Place tag near reader...");
    println!("Version: {:x}, Press Ctrl+C to exit", version);
    
    // Main detection loop
    loop {
        // Request card
        if let Ok(atqa) = mfrc522.reqa() {
            println!("Card detected!");
            
            // Select card
            if let Ok(uid) = mfrc522.select(&atqa) {
                // Convert UID bytes to hex string
                let uid_bytes = uid.as_bytes();
                let uid_hex: Vec<String> = uid_bytes.iter()
                    .map(|b| format!("{:02X}", b))
                    .collect();
                
                println!("Card selected! UID: {}", uid_hex.join(":"));
                
                // Go back to idle state
                let _ = mfrc522.hlta();
            } else {
                println!("Failed to select card");
            }
        }
        
        // Sleep a bit before next check (like Python)
        thread::sleep(Duration::from_millis(100));
    }
}