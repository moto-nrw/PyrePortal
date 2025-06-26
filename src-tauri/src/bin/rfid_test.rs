use linux_embedded_hal::{
    spidev::{SpiModeFlags, SpidevOptions},
    Spidev,
};
use mfrc522::{comm::eh02::spi::SpiInterface, Mfrc522, RxGain};
use rppal::gpio::Gpio;
use std::{error::Error, fmt, thread, time::{Duration, Instant}};

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

fn main() -> Result<(), Box<dyn Error>> {
    println!("\n=== RFID Hardware Test Program ===");
    println!("Testing with 4MHz SPI speed and extensive logging\n");

    // Test single scan
    println!("Test 1: Single scan test");
    match scan_rfid_hardware_single() {
        Ok(tag_id) => println!("✅ Single scan successful! Tag ID: {}", tag_id),
        Err(e) => println!("❌ Single scan failed: {}", e),
    }

    println!("\nTest 2: Continuous scanning for 10 seconds");
    continuous_scan_test(Duration::from_secs(10))?;

    println!("\nTest 3: Performance test - 100 scan attempts");
    performance_test()?;

    Ok(())
}

fn scan_rfid_hardware_single() -> Result<String, String> {
    println!("  [INIT] Starting hardware initialization...");
    
    // Initialize SPI device
    println!("  [SPI] Opening /dev/spidev0.0...");
    let mut spi = match Spidev::open("/dev/spidev0.0") {
        Ok(s) => {
            println!("  [SPI] ✅ Device opened successfully");
            s
        }
        Err(e) => {
            println!("  [SPI] ❌ Failed to open device: {:?}", e);
            return Err(format!("Failed to open SPI device 0.0: {:?}", e));
        }
    };

    // SPI configuration - 4MHz speed
    println!("  [SPI] Configuring SPI: 4MHz, 8-bit, MODE_0");
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(4_000_000)  // 4MHz - 4x faster than before!
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();

    if let Err(e) = spi.configure(&options) {
        println!("  [SPI] ❌ Configuration failed: {:?}", e);
        return Err(format!("Failed to configure SPI: {:?}", e));
    }
    println!("  [SPI] ✅ Configured at 4MHz");

    // Setup GPIO
    println!("  [GPIO] Initializing GPIO...");
    let gpio = match Gpio::new() {
        Ok(g) => {
            println!("  [GPIO] ✅ GPIO initialized");
            g
        }
        Err(e) => {
            println!("  [GPIO] ❌ Failed: {:?}", e);
            return Err(format!("Failed to initialize GPIO: {:?}", e));
        }
    };

    let reset_pin_number = 22;
    println!("  [GPIO] Setting up reset pin {} (BCM)...", reset_pin_number);
    let mut reset_pin = match gpio.get(reset_pin_number) {
        Ok(pin) => {
            println!("  [GPIO] ✅ Reset pin configured");
            pin.into_output()
        }
        Err(e) => {
            println!("  [GPIO] ❌ Failed to setup pin: {:?}", e);
            return Err(format!(
                "Failed to setup reset pin on GPIO {}: {:?}",
                reset_pin_number, e
            ))
        }
    };

    // Initialize with reset HIGH
    println!("  [RESET] Setting reset pin HIGH");
    reset_pin.set_high();

    // Perform hardware reset
    println!("  [RESET] Performing hardware reset sequence...");
    reset_pin.set_low();
    println!("  [RESET] Pin LOW - waiting 50ms");
    thread::sleep(Duration::from_millis(50));
    reset_pin.set_high();
    println!("  [RESET] Pin HIGH - waiting 50ms");
    thread::sleep(Duration::from_millis(50));
    println!("  [RESET] ✅ Reset sequence complete");

    // Create MFRC522 instance
    println!("  [MFRC522] Creating SPI interface...");
    let spi_interface = SpiInterface::new(spi);
    let mfrc522 = Mfrc522::new(spi_interface);

    // Initialize the MFRC522
    println!("  [MFRC522] Initializing MFRC522...");
    let mut mfrc522 = match mfrc522.init() {
        Ok(m) => {
            println!("  [MFRC522] ✅ Initialized successfully");
            m
        }
        Err(e) => {
            println!("  [MFRC522] ❌ Initialization failed: {:?}", e);
            return Err(format!("Failed to initialize MFRC522: {:?}", e));
        }
    };

    // Read and verify version
    println!("  [MFRC522] Reading chip version...");
    let version = match mfrc522.version() {
        Ok(v) => {
            println!("  [MFRC522] ✅ Version: 0x{:02X}", v);
            match v {
                0x91 => println!("  [MFRC522] ℹ️  Version 1.0"),
                0x92 => println!("  [MFRC522] ℹ️  Version 2.0"),
                _ => println!("  [MFRC522] ⚠️  Unknown version"),
            }
            v
        }
        Err(e) => {
            println!("  [MFRC522] ❌ Failed to read version: {:?}", e);
            return Err(format!("Failed to read MFRC522 version: {:?}", e));
        }
    };

    // Set antenna gain to maximum
    println!("  [ANTENNA] Setting antenna gain to maximum (48dB)...");
    if let Err(e) = mfrc522.set_antenna_gain(RxGain::DB48) {
        println!("  [ANTENNA] ⚠️  Failed to set antenna gain: {:?}", e);
        println!("  [ANTENNA] ℹ️  Continuing with default gain");
    } else {
        println!("  [ANTENNA] ✅ Antenna gain set to 48dB");
    }

    // Scan for cards with timeout
    println!("\n  [SCAN] Starting card scan (5 second timeout)...");
    let start_time = Instant::now();
    let mut attempt_count = 0;

    loop {
        attempt_count += 1;
        
        // Check for timeout
        if start_time.elapsed() > Duration::from_secs(5) {
            println!("  [SCAN] ⏱️  Timeout after {} attempts", attempt_count);
            return Err("Scan timeout - no card detected".to_string());
        }

        // Request card
        match mfrc522.reqa() {
            Ok(atqa) => {
                println!("  [SCAN] 📡 Card detected! ATQA: {:?}", atqa);
                
                // Select card
                match mfrc522.select(&atqa) {
                    Ok(uid) => {
                        // Convert UID bytes to hex string
                        let uid_bytes = uid.as_bytes();
                        let uid_hex: Vec<String> =
                            uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                        
                        println!("  [SCAN] ✅ Card selected successfully");
                        println!("  [SCAN] 🏷️  UID: {}", uid_hex.join(":"));
                        println!("  [SCAN] ℹ️  UID length: {} bytes", uid_bytes.len());
                        
                        // Go back to idle state
                        if let Err(e) = mfrc522.hlta() {
                            println!("  [SCAN] ⚠️  HALT command failed: {:?}", e);
                        } else {
                            println!("  [SCAN] ✅ Card halted");
                        }

                        println!("  [SCAN] ✅ Scan completed in {} attempts ({:.2}ms)", 
                                 attempt_count, start_time.elapsed().as_millis());
                        
                        return Ok(uid_hex.join(":"));
                    }
                    Err(e) => {
                        println!("  [SCAN] ❌ Failed to select card: {:?}", e);
                    }
                }
            }
            Err(_) => {
                // Don't log every attempt to avoid spam
                if attempt_count % 10 == 0 {
                    print!(".");
                    use std::io::{self, Write};
                    io::stdout().flush().unwrap();
                }
            }
        }

        // Sleep before next attempt
        thread::sleep(Duration::from_millis(20));
    }
}

fn continuous_scan_test(duration: Duration) -> Result<(), Box<dyn Error>> {
    println!("  [CONTINUOUS] Starting continuous scan test...");
    let start_time = Instant::now();
    let mut scan_count = 0;
    let mut success_count = 0;
    let mut last_tag = None;

    while start_time.elapsed() < duration {
        match scan_rfid_hardware_with_timeout(Duration::from_millis(500)) {
            Ok(tag_id) => {
                success_count += 1;
                if last_tag.as_ref() != Some(&tag_id) {
                    println!("  [CONTINUOUS] 🏷️  New tag detected: {}", tag_id);
                    last_tag = Some(tag_id);
                }
            }
            Err(e) => {
                if !e.contains("timeout") {
                    println!("  [CONTINUOUS] ❌ Error: {}", e);
                }
            }
        }
        scan_count += 1;
        
        // Print progress
        if scan_count % 20 == 0 {
            let elapsed = start_time.elapsed().as_secs();
            let success_rate = (success_count as f32 / scan_count as f32) * 100.0;
            println!("  [CONTINUOUS] 📊 {} scans, {:.1}% success rate, {}s elapsed", 
                     scan_count, success_rate, elapsed);
        }
    }

    let success_rate = (success_count as f32 / scan_count as f32) * 100.0;
    println!("\n  [CONTINUOUS] Summary:");
    println!("  - Total scans: {}", scan_count);
    println!("  - Successful: {}", success_count);
    println!("  - Success rate: {:.1}%", success_rate);
    println!("  - Avg scan time: {:.2}ms", duration.as_millis() as f32 / scan_count as f32);

    Ok(())
}

fn performance_test() -> Result<(), Box<dyn Error>> {
    println!("  [PERF] Starting performance test...");
    let mut timings = Vec::new();

    for i in 1..=100 {
        let start = Instant::now();
        let result = scan_rfid_hardware_with_timeout(Duration::from_millis(100));
        let elapsed = start.elapsed();
        
        if result.is_ok() {
            timings.push(elapsed.as_micros());
        }
        
        if i % 10 == 0 {
            print!(".");
            use std::io::{self, Write};
            io::stdout().flush().unwrap();
        }
    }
    
    println!();
    
    if !timings.is_empty() {
        let avg = timings.iter().sum::<u128>() / timings.len() as u128;
        let min = *timings.iter().min().unwrap();
        let max = *timings.iter().max().unwrap();
        
        println!("  [PERF] Results:");
        println!("  - Successful reads: {}/100", timings.len());
        println!("  - Average time: {:.2}ms", avg as f32 / 1000.0);
        println!("  - Fastest: {:.2}ms", min as f32 / 1000.0);
        println!("  - Slowest: {:.2}ms", max as f32 / 1000.0);
    } else {
        println!("  [PERF] ❌ No successful reads!");
    }

    Ok(())
}

// Simplified version without all the logging for continuous use
fn scan_rfid_hardware_with_timeout(timeout: Duration) -> Result<String, String> {
    let mut spi = Spidev::open("/dev/spidev0.0")
        .map_err(|e| format!("Failed to open SPI: {:?}", e))?;
    
    let options = SpidevOptions::new()
        .bits_per_word(8)
        .max_speed_hz(4_000_000)  // 4MHz
        .mode(SpiModeFlags::SPI_MODE_0)
        .build();
    
    spi.configure(&options)
        .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;
    
    let gpio = Gpio::new()
        .map_err(|e| format!("Failed to init GPIO: {:?}", e))?;
    
    let mut reset_pin = gpio.get(22)
        .map_err(|e| format!("Failed to get pin: {:?}", e))?
        .into_output();
    
    reset_pin.set_high();
    reset_pin.set_low();
    thread::sleep(Duration::from_millis(10));
    reset_pin.set_high();
    thread::sleep(Duration::from_millis(10));
    
    let spi_interface = SpiInterface::new(spi);
    let mfrc522 = Mfrc522::new(spi_interface);
    let mut mfrc522 = mfrc522.init()
        .map_err(|e| format!("Failed to init MFRC522: {:?}", e))?;
    
    let _ = mfrc522.set_antenna_gain(RxGain::DB48);
    
    let start_time = Instant::now();
    
    loop {
        if start_time.elapsed() > timeout {
            return Err("Scan timeout".to_string());
        }
        
        if let Ok(atqa) = mfrc522.reqa() {
            if let Ok(uid) = mfrc522.select(&atqa) {
                let uid_bytes = uid.as_bytes();
                let uid_hex: Vec<String> =
                    uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();
                let _ = mfrc522.hlta();
                return Ok(uid_hex.join(":"));
            }
        }
        
        thread::sleep(Duration::from_millis(5));
    }
}