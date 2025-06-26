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

    println!("\n=== RFID Persistent Scanner ===");
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
    
    mfrc522.set_antenna_gain(RxGain::DB48).ok();
    println!("✓ Antenna gain: 48dB\n");
    
    println!("Starting continuous scan...\n");
    
    // Scan forever
    let mut scan_num = 0;
    loop {
        scan_num += 1;
        
        // Try WUPA
        if let Ok(atqa) = mfrc522.wupa() {
            println!("[{}] WUPA success!", scan_num);
            
            match mfrc522.select(&atqa) {
                Ok(uid) => {
                    let uid_bytes = uid.as_bytes();
                    let uid_hex: Vec<String> = uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                    println!("[{}] ✅ TAG: {}", scan_num, uid_hex.join(":"));
                    
                    // ALWAYS halt the card
                    let _ = mfrc522.hlta();
                    println!("[{}] Card halted", scan_num);
                    
                    // Wait a bit for card to be removed
                    thread::sleep(Duration::from_millis(500));
                }
                Err(e) => {
                    println!("[{}] ❌ Select failed: {:?}", scan_num, e);
                    // Still try to halt
                    let _ = mfrc522.hlta();
                }
            }
        } else {
            // Only print every 10th scan to reduce noise
            if scan_num % 10 == 0 {
                println!("[{}] No card", scan_num);
            }
        }
        
        thread::sleep(Duration::from_millis(50));
    }
}