use linux_embedded_hal::{
    spidev::{SpiModeFlags, SpidevOptions},
    Spidev,
};
use mfrc522::{comm::eh02::spi::SpiInterface, Mfrc522, RxGain};
use rppal::gpio::Gpio;
use std::{thread, time::{Duration, Instant}};

fn main() {
    println!("\n=== RFID Continuous Scanner Test ===");
    println!("Press Ctrl+C to stop\n");

    loop {
        match scan_with_logging() {
            Ok(tag_id) => {
                println!("\n✅ TAG DETECTED: {}", tag_id);
                println!("   Time: {:?}\n", Instant::now());
                
                // Wait a bit to avoid duplicate reads
                thread::sleep(Duration::from_millis(500));
            }
            Err(e) => {
                if !e.contains("timeout") && !e.contains("no card detected") {
                    println!("❌ ERROR: {}", e);
                }
            }
        }
    }
}

fn scan_with_logging() -> Result<String, String> {
    println!("🔄 Starting scan cycle...");
    
    // Initialize SPI
    println!("  📡 Opening SPI device /dev/spidev0.0");
    let mut spi = Spidev::open("/dev/spidev0.0")
        .map_err(|e| format!("Failed to open SPI: {:?}", e))?;
    
    // Configure SPI - matching your main implementation
    println!("  ⚙️  Configuring SPI: 1MHz, 8-bit, MODE_0");
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(1_000_000)  // 1MHz like your main code
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();
    
    spi.configure(&options)
        .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;
    
    // Setup GPIO
    println!("  🔌 Initializing GPIO");
    let gpio = Gpio::new()
        .map_err(|e| format!("Failed to init GPIO: {:?}", e))?;
    
    let mut reset_pin = gpio.get(22)
        .map_err(|e| format!("Failed to get GPIO 22: {:?}", e))?
        .into_output();
    
    // Hardware reset
    println!("  🔄 Performing hardware reset");
    reset_pin.set_high();
    reset_pin.set_low();
    thread::sleep(Duration::from_millis(50));
    reset_pin.set_high();
    thread::sleep(Duration::from_millis(50));
    
    // Initialize MFRC522
    println!("  📟 Initializing MFRC522");
    let spi_interface = SpiInterface::new(spi);
    let mfrc522 = Mfrc522::new(spi_interface);
    let mut mfrc522 = mfrc522.init()
        .map_err(|e| format!("Failed to init MFRC522: {:?}", e))?;
    
    // Read version
    match mfrc522.version() {
        Ok(v) => println!("  ✓ MFRC522 version: 0x{:02X}", v),
        Err(e) => println!("  ⚠️  Failed to read version: {:?}", e),
    }
    
    // Set antenna gain
    println!("  📶 Setting antenna gain to 48dB");
    if let Err(e) = mfrc522.set_antenna_gain(RxGain::DB48) {
        println!("  ⚠️  Failed to set gain: {:?}", e);
    }
    
    // Scan for cards (500ms timeout like your code)
    println!("  👀 Scanning for cards...");
    let start_time = Instant::now();
    let mut attempts = 0;
    
    loop {
        attempts += 1;
        
        // Timeout check
        if start_time.elapsed() > Duration::from_millis(500) {
            println!("  ⏱️  Timeout after {} attempts", attempts);
            return Err("Scan timeout - no card detected".to_string());
        }
        
        // Try to detect card
        if let Ok(_atqa) = mfrc522.reqa() {
            // Card detected, try to read UID
            if let Ok(uid) = mfrc522.select(&_atqa) {
                let uid_bytes = uid.as_bytes();
                let uid_hex: Vec<String> = 
                    uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                
                println!("  ✓ Card selected after {} attempts", attempts);
                println!("  ✓ Scan time: {:?}", start_time.elapsed());
                
                let _ = mfrc522.hlta();
                return Ok(uid_hex.join(":"));
            }
        }
        
        // Same polling interval as your main code
        thread::sleep(Duration::from_millis(15));
    }
}