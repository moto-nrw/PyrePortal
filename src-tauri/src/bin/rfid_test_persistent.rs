#[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
fn main() {
    println!("This test can only run on Raspberry Pi (ARM Linux)");
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

    // Configuration constants
    const ANTENNA_GAIN: RxGain = RxGain::DB48; // Try DB43 if having issues
    const SCAN_INTERVAL_MS: u64 = 20; // Reduced from 50ms for faster scanning
    const RETRY_DELAY_MS: u64 = 5; // Delay before retry on IncompleteFrame

    println!("\n=== RFID Persistent Scanner (Optimized for NTAG216) ===");
    println!("Initialize hardware ONCE, then scan forever\n");

    // Initialize hardware ONCE
    let mut spi = Spidev::open("/dev/spidev0.0").unwrap();
    println!("✓ SPI opened");
    
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(1_000_000)
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();
    spi.configure(&options).unwrap();
    println!("✓ SPI configured at 1MHz");
    
    let gpio = Gpio::new().unwrap();
    let mut reset_pin = gpio.get(22).unwrap().into_output();
    
    // Hardware reset
    reset_pin.set_high();
    reset_pin.set_low();
    thread::sleep(Duration::from_millis(50));
    reset_pin.set_high();
    thread::sleep(Duration::from_millis(50));
    println!("✓ Hardware reset");
    
    let spi_interface = SpiInterface::new(spi);
    let mfrc522 = Mfrc522::new(spi_interface);
    let mut mfrc522 = mfrc522.init().unwrap();
    println!("✓ MFRC522 initialized");
    
    if let Ok(v) = mfrc522.version() {
        println!("✓ Version: 0x{:02X}", v);
    }
    
    // Set antenna gain
    mfrc522.set_antenna_gain(ANTENNA_GAIN).ok();
    println!("✓ Antenna gain: {:?}", ANTENNA_GAIN);
    
    println!("\nStarting continuous scan ({}ms interval)...\n", SCAN_INTERVAL_MS);
    
    // Scan forever
    let mut scan_num = 0;
    let mut incomplete_frames = 0;
    let mut successes = 0;
    
    loop {
        scan_num += 1;
        
        // Try WUPA
        if let Ok(atqa) = mfrc522.wupa() {
            println!("[{}] WUPA success!", scan_num);
            
            // First select attempt
            match mfrc522.select(&atqa) {
                Ok(uid) => {
                    successes += 1;
                    let uid_bytes = uid.as_bytes();
                    let uid_hex: Vec<String> = uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                    let uid_len = uid_bytes.len();
                    println!("[{}] ✅ TAG: {} ({} bytes)", scan_num, uid_hex.join(":"), uid_len);
                    
                    // Identify card type
                    if uid_len == 4 {
                        println!("     → Likely NTAG216 wristband");
                    } else if uid_len == 7 {
                        println!("     → Likely RC522/Classic card");
                    }
                    
                    // ALWAYS halt the card
                    let _ = mfrc522.hlta();
                    println!("[{}] Card halted", scan_num);
                    
                    // Wait a bit for card to be removed
                    thread::sleep(Duration::from_millis(500));
                }
                Err(e) => {
                    // Check if it's an IncompleteFrame error
                    let error_str = format!("{:?}", e);
                    if error_str.contains("IncompleteFrame") {
                        incomplete_frames += 1;
                        println!("[{}] ⚠️  IncompleteFrame - retrying...", scan_num);
                        
                        // Short delay before retry
                        thread::sleep(Duration::from_millis(RETRY_DELAY_MS));
                        
                        // Retry select without new WUPA
                        match mfrc522.select(&atqa) {
                            Ok(uid) => {
                                successes += 1;
                                let uid_bytes = uid.as_bytes();
                                let uid_hex: Vec<String> = uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                                println!("[{}] ✅ RETRY SUCCESS: {}", scan_num, uid_hex.join(":"));
                                let _ = mfrc522.hlta();
                                thread::sleep(Duration::from_millis(500));
                            }
                            Err(e) => {
                                println!("[{}] ❌ Retry also failed: {:?}", scan_num, e);
                                let _ = mfrc522.hlta();
                            }
                        }
                    } else {
                        println!("[{}] ❌ Select failed: {:?}", scan_num, e);
                        // Still try to halt
                        let _ = mfrc522.hlta();
                    }
                }
            }
        } else {
            // Only print every 10th scan to reduce noise
            if scan_num % 10 == 0 {
                println!("[{}] No card (Success: {}, IncFrames: {})", 
                         scan_num, successes, incomplete_frames);
            }
        }
        
        thread::sleep(Duration::from_millis(SCAN_INTERVAL_MS));
    }
}