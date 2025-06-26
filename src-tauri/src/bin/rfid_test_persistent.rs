#[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
fn main() {
    println!("This test can only run on Raspberry Pi (ARM Linux)");
    println!("Please run on your Raspberry Pi with:");
    println!("  cd src-tauri && ./test_rfid_persistent.sh");
}

#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
fn main() {
    use linux_embedded_hal::{
        spidev::{SpiModeFlags, SpidevOptions},
        Spidev,
    };
    use mfrc522::{comm::eh02::spi::SpiInterface, Mfrc522, RxGain};
    use rppal::gpio::Gpio;
    use std::{thread, time::Duration};

    println!("\n=== RFID Persistent Hardware Test ===");
    println!("Hardware initialized ONCE, then continuous scanning");
    println!("Press Ctrl+C to stop\n");

    // Initialize hardware ONCE
    println!("🔧 One-time hardware initialization...");
    
    // Initialize SPI
    println!("  📡 Opening SPI device /dev/spidev0.0");
    let mut spi = match Spidev::open("/dev/spidev0.0") {
        Ok(s) => s,
        Err(e) => {
            println!("❌ Failed to open SPI: {:?}", e);
            return;
        }
    };
    
    // Configure SPI
    println!("  ⚙️  Configuring SPI: 1MHz, 8-bit, MODE_0");
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(1_000_000)
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();
    
    if let Err(e) = spi.configure(&options) {
        println!("❌ Failed to configure SPI: {:?}", e);
        return;
    }
    
    // Setup GPIO
    println!("  🔌 Initializing GPIO");
    let gpio = match Gpio::new() {
        Ok(g) => g,
        Err(e) => {
            println!("❌ Failed to init GPIO: {:?}", e);
            return;
        }
    };
    
    let mut reset_pin = match gpio.get(22) {
        Ok(pin) => pin.into_output(),
        Err(e) => {
            println!("❌ Failed to get GPIO 22: {:?}", e);
            return;
        }
    };
    
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
    let mut mfrc522 = match mfrc522.init() {
        Ok(m) => m,
        Err(e) => {
            println!("❌ Failed to init MFRC522: {:?}", e);
            return;
        }
    };
    
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
    println!("Starting continuous scanning...\n");
    
    let mut scan_count = 0;
    let mut success_count = 0;
    let mut last_tag = String::new();
    
    // Continuous scanning loop
    loop {
        scan_count += 1;
        
        // Try WUPA for better NTAG compatibility
        if let Ok(atqa) = mfrc522.wupa() {
            // Card detected, try to read UID
            match mfrc522.select(&atqa) {
                Ok(uid) => {
                    success_count += 1;
                    
                    let uid_bytes = uid.as_bytes();
                    let uid_hex: Vec<String> = 
                        uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                    let tag_id = uid_hex.join(":");
                    
                    // Only print if different tag or first scan
                    if tag_id != last_tag {
                        println!("\n✅ TAG DETECTED: {}", tag_id);
                        println!("   UID Length: {} bytes", uid_hex.len());
                        println!("   Success rate: {:.1}% ({}/{})", 
                                 (success_count as f32 / scan_count as f32) * 100.0,
                                 success_count, scan_count);
                        last_tag = tag_id;
                    }
                    
                    // Halt the card
                    let _ = mfrc522.hlta();
                    
                    // Small delay to avoid duplicate reads
                    thread::sleep(Duration::from_millis(200));
                }
                Err(_) => {
                    // Selection failed
                    println!("❌ Card detected but selection failed");
                    let _ = mfrc522.hlta();
                }
            }
        } else {
            // No card detected
            // Print stats every 10 failed attempts
            if scan_count % 10 == 0 {
                println!("   Stats: {}/{} successful scans ({:.1}%)", 
                         success_count, scan_count,
                         (success_count as f32 / scan_count as f32) * 100.0);
            }
        }
        
        // Small delay between scan attempts
        thread::sleep(Duration::from_millis(50));
    }
}