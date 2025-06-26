use linux_embedded_hal::{
    spidev::{SpiModeFlags, SpidevOptions},
    Spidev,
};
use mfrc522::{comm::eh02::spi::SpiInterface, Mfrc522, RxGain};
use rppal::gpio::Gpio;
use std::{thread, time::{Duration, Instant}};

fn main() {
    println!("\n=== RFID Persistent Hardware Test ===");
    println!("Hardware initialized ONCE, then continuous scanning");
    println!("Press Ctrl+C to stop\n");

    // Initialize hardware ONCE
    match initialize_hardware() {
        Ok(mut mfrc522) => {
            println!("✅ Hardware initialized successfully!\n");
            println!("Starting continuous scanning...\n");
            
            let mut scan_count = 0;
            let mut success_count = 0;
            let mut last_tag = String::new();
            
            // Continuous scanning loop
            loop {
                scan_count += 1;
                
                match scan_card(&mut mfrc522) {
                    Ok(tag_id) => {
                        success_count += 1;
                        
                        // Only print if different tag or first scan
                        if tag_id != last_tag {
                            println!("\n✅ TAG DETECTED: {}", tag_id);
                            println!("   UID Length: {} bytes", tag_id.split(':').count());
                            println!("   Success rate: {:.1}% ({}/{})", 
                                     (success_count as f32 / scan_count as f32) * 100.0,
                                     success_count, scan_count);
                            last_tag = tag_id;
                        }
                        
                        // Small delay to avoid duplicate reads
                        thread::sleep(Duration::from_millis(200));
                    }
                    Err(e) => {
                        if !e.contains("No card") {
                            println!("❌ ERROR: {}", e);
                        }
                        // Print stats every 10 failed attempts
                        if scan_count % 10 == 0 {
                            println!("   Stats: {}/{} successful scans ({:.1}%)", 
                                     success_count, scan_count,
                                     (success_count as f32 / scan_count as f32) * 100.0);
                        }
                    }
                }
                
                // Small delay between scan attempts
                thread::sleep(Duration::from_millis(50));
            }
        }
        Err(e) => {
            println!("❌ Failed to initialize hardware: {}", e);
        }
    }
}

fn initialize_hardware() -> Result<Mfrc522<SpiInterface<Spidev>, mfrc522::Initialized>, String> {
    println!("🔧 One-time hardware initialization...");
    
    // Initialize SPI
    println!("  📡 Opening SPI device /dev/spidev0.0");
    let mut spi = Spidev::open("/dev/spidev0.0")
        .map_err(|e| format!("Failed to open SPI: {:?}", e))?;
    
    // Configure SPI
    println!("  ⚙️  Configuring SPI: 1MHz, 8-bit, MODE_0");
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(1_000_000)
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
    
    // Let hardware stabilize
    println!("  ⏳ Letting hardware stabilize...");
    thread::sleep(Duration::from_millis(100));
    
    println!("  ✅ Hardware ready!\n");
    Ok(mfrc522)
}

fn scan_card(mfrc522: &mut Mfrc522<SpiInterface<Spidev>, mfrc522::Initialized>) -> Result<String, String> {
    // Quick scan - no timeout, just try once
    
    // Try WUPA for better NTAG compatibility
    if let Ok(atqa) = mfrc522.wupa() {
        // Card detected, try to read UID
        match mfrc522.select(&atqa) {
            Ok(uid) => {
                let uid_bytes = uid.as_bytes();
                let uid_hex: Vec<String> = 
                    uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                
                // Halt the card
                let _ = mfrc522.hlta();
                
                return Ok(uid_hex.join(":"));
            }
            Err(_) => {
                // Selection failed
                return Err("Card detected but selection failed".to_string());
            }
        }
    }
    
    Err("No card detected".to_string())
}