#[cfg(target_os = "linux")]
use rppal::spi::{Spi, Bus, SlaveSelect, Mode};
#[cfg(target_os = "linux")]
use rppal::gpio::{Gpio, OutputPin, Level};

use super::interface::{RfidReader, RfidTag, RfidError};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::AppHandle;
use chrono::Utc;
use std::time::Duration;
use log::{info, warn, error, debug};

const MAX_INIT_ATTEMPTS: u8 = 10;

pub struct RaspberryPiRfidReader {
    scanning: Arc<Mutex<bool>>,
    scan_thread: Option<thread::JoinHandle<()>>,
    app_handle: Option<AppHandle>,
    // SPI and GPIO connection info
    spi_bus: u8,
    spi_slave_select: u8,
    reset_pin: u8,
}

impl RaspberryPiRfidReader {
    pub fn new() -> Self {
        // Default connections based on common configurations
        Self {
            scanning: Arc::new(Mutex::new(false)),
            scan_thread: None,
            app_handle: None,
            spi_bus: 0, // SPI0
            spi_slave_select: 0, // CE0
            reset_pin: 25, // GPIO 25 for reset
        }
    }
    
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }
    
    // Configure connection parameters
    pub fn configure(&mut self, spi_bus: u8, spi_slave_select: u8, reset_pin: u8) {
        self.spi_bus = spi_bus;
        self.spi_slave_select = spi_slave_select;
        self.reset_pin = reset_pin;
    }
    
    #[cfg(target_os = "linux")]
    // Initialize MFRC522
    fn initialize_mfrc522(&self) -> Result<(Spi, OutputPin), RfidError> {
        // Initialize SPI
        let spi = match Spi::new(
            match self.spi_bus {
                0 => Bus::Spi0,
                1 => Bus::Spi1,
                _ => return Err(RfidError::Configuration("Invalid SPI bus".into())),
            },
            match self.spi_slave_select {
                0 => SlaveSelect::Ss0,
                1 => SlaveSelect::Ss1,
                _ => return Err(RfidError::Configuration("Invalid slave select".into())),
            },
            1000000, // 1 MHz
            Mode::Mode0
        ) {
            Ok(spi) => spi,
            Err(e) => return Err(RfidError::Hardware(format!("SPI initialization failed: {}", e))),
        };
        
        // Initialize GPIO for reset pin
        let gpio = Gpio::new().map_err(|e| RfidError::Hardware(format!("GPIO initialization failed: {}", e)))?;
        let reset_pin = gpio.get(self.reset_pin)
            .map_err(|e| RfidError::Hardware(format!("Reset pin setup failed: {}", e)))?
            .into_output();
            
        // Reset the MFRC522
        let mut reset_pin = reset_pin;
        reset_pin.set_low();
        thread::sleep(Duration::from_millis(100));
        reset_pin.set_high();
        thread::sleep(Duration::from_millis(100));
        
        // Send initialization commands to MFRC522
        // These would be specific SPI commands based on the datasheet
        
        Ok((spi, reset_pin))
    }
    
    #[cfg(not(target_os = "linux"))]
    fn initialize_mfrc522(&self) -> Result<(), RfidError> {
        // Mock implementation for non-Linux platforms
        Err(RfidError::Other("MFRC522 not supported on this platform".into()))
    }
    
    #[cfg(target_os = "linux")]
    // Initialize with limited retry
    fn initialize_with_retry(&self) -> Result<(Spi, OutputPin), RfidError> {
        let mut last_error = RfidError::Hardware("Initialization not attempted".into());
        
        for attempt in 0..MAX_INIT_ATTEMPTS {
            match self.initialize_mfrc522() {
                Ok(connection) => {
                    info!("MFRC522 initialized successfully on attempt {}", attempt + 1);
                    return Ok(connection);
                },
                Err(e) => {
                    warn!("MFRC522 initialization failed (attempt {}/{}): {}", 
                          attempt + 1, MAX_INIT_ATTEMPTS, e);
                    last_error = e;
                    
                    // Backoff with increasing delay (50ms, 100ms, 200ms, etc.)
                    thread::sleep(Duration::from_millis(50 * 2_u64.pow(attempt as u32)));
                }
            }
        }
        
        error!("MFRC522 initialization failed after {} attempts", MAX_INIT_ATTEMPTS);
        Err(last_error)
    }
    
    #[cfg(not(target_os = "linux"))]
    fn initialize_with_retry(&self) -> Result<(), RfidError> {
        // Mock implementation for non-Linux platforms
        Err(RfidError::Other("MFRC522 not supported on this platform".into()))
    }
    
    #[cfg(target_os = "linux")]
    // Read card UID from MFRC522
    fn read_card_uid(&self, spi: &mut Spi) -> Result<Option<String>, RfidError> {
        // This simplified implementation would be replaced with actual MFRC522 protocol
        // For a real implementation, you would:
        // 1. Send REQA or WUPA command
        // 2. Check if a card is present
        // 3. Run anti-collision procedure
        // 4. Select the card
        // 5. Read the UID
        
        // For demonstration, just return a mock value
        // In a real implementation, this would communicate with the actual hardware
        Ok(Some("1234567890".to_string()))
    }
    
    #[cfg(not(target_os = "linux"))]
    fn read_card_uid(&self, _spi: &mut ()) -> Result<Option<String>, RfidError> {
        // Mock implementation for non-Linux platforms
        Err(RfidError::Other("MFRC522 not supported on this platform".into()))
    }
}

impl RfidReader for RaspberryPiRfidReader {
    fn start_scan(&mut self) -> Result<(), RfidError> {
        let app_handle = match &self.app_handle {
            Some(handle) => handle.clone(),
            None => return Err(RfidError::Configuration("App handle not set".into())),
        };
        
        let scanning = self.scanning.clone();
        *scanning.lock().unwrap() = true;
        
        // Store configuration values for the thread
        let spi_bus = self.spi_bus;
        let spi_slave_select = self.spi_slave_select;
        let reset_pin = self.reset_pin;
        
        info!("Starting RFID scanning thread");
        
        #[cfg(target_os = "linux")]
        {
            self.scan_thread = Some(thread::spawn(move || {
                // Create a reader in this thread
                let mut reader = RaspberryPiRfidReader {
                    scanning: scanning.clone(),
                    scan_thread: None,
                    app_handle: Some(app_handle.clone()),
                    spi_bus,
                    spi_slave_select,
                    reset_pin,
                };
                
                // Initialize hardware with retry
                let mut spi_and_reset = match reader.initialize_with_retry() {
                    Ok((spi, reset)) => Some((spi, reset)),
                    Err(e) => {
                        error!("Failed to initialize RFID reader: {}", e);
                        let _ = app_handle.emit_all("rfid-error", e.to_string());
                        None
                    }
                };
                
                // Main scanning loop
                let mut last_tag_id: Option<String> = None;
                let mut hardware_error_count = 0;
                
                info!("RFID scan loop started");
                while *scanning.lock().unwrap() {
                    // Check if we have initialized hardware
                    if spi_and_reset.is_none() {
                        // If we've had too many errors, exit the loop
                        if hardware_error_count >= MAX_INIT_ATTEMPTS {
                            error!("Too many hardware errors, stopping RFID scanning");
                            break;
                        }
                        
                        // Try to reinitialize
                        info!("Attempting to reinitialize RFID reader");
                        spi_and_reset = match reader.initialize_with_retry() {
                            Ok((spi, reset)) => {
                                hardware_error_count = 0; // Reset error count
                                Some((spi, reset))
                            },
                            Err(e) => {
                                hardware_error_count += 1;
                                error!("Failed to reinitialize RFID reader: {}", e);
                                let _ = app_handle.emit_all("rfid-error", e.to_string());
                                None
                            }
                        };
                        
                        if spi_and_reset.is_none() {
                            // Wait before retry
                            thread::sleep(Duration::from_secs(5));
                            continue;
                        }
                    }
                    
                    let (spi, _) = spi_and_reset.as_mut().unwrap();
                    
                    // Try to read card
                    match reader.read_card_uid(spi) {
                        Ok(Some(uid)) => {
                            // Only notify if it's a new tag
                            if last_tag_id.as_ref() != Some(&uid) {
                                info!("New RFID tag detected: {}", uid);
                                let tag = RfidTag {
                                    id: uid.clone(),
                                    timestamp: Utc::now().timestamp(),
                                };
                                
                                let _ = app_handle.emit_all("rfid-tag-scanned", tag);
                                last_tag_id = Some(uid);
                                hardware_error_count = 0; // Reset error count on success
                            }
                        },
                        Ok(None) => {
                            // No card present
                            if last_tag_id.is_some() {
                                debug!("Card removed");
                                last_tag_id = None;
                            }
                        },
                        Err(e) => {
                            // Hardware error
                            warn!("Error reading RFID card: {}", e);
                            
                            hardware_error_count += 1;
                            if hardware_error_count >= 5 {
                                // Too many consecutive errors, try to reinitialize
                                error!("Too many consecutive read errors, reinitializing reader");
                                let _ = app_handle.emit_all("rfid-error", "Reader communication error, reinitializing".to_string());
                                
                                // Clean up old connection
                                drop(spi_and_reset.take());
                                
                                // Wait a moment before reinitializing
                                thread::sleep(Duration::from_secs(1));
                            }
                        }
                    }
                    
                    // Add a small delay to prevent busy-waiting
                    thread::sleep(Duration::from_millis(100));
                }
                
                // Cleanup
                info!("RFID scanning stopped");
                if let Some((_, mut reset_pin)) = spi_and_reset {
                    reset_pin.set_low(); // Reset the MFRC522 on exit
                }
            }));
        }
        
        #[cfg(not(target_os = "linux"))]
        {
            // For non-Linux platforms, use a mock implementation similar to MockRfidReader
            self.scan_thread = Some(thread::spawn(move || {
                info!("🔍 Mock RFID scanner started (Linux-only implementation)");
                
                // Create a list of mock tags
                let mock_tags = vec![
                    "1234567890",  // Will check in Jane Smith
                    "0987654321",  // Will check out John Doe
                ];
                
                // For development, simulate occasional tag scans
                let mut counter = 0;
                while *scanning.lock().unwrap() {
                    thread::sleep(Duration::from_secs(3));
                    
                    if !*scanning.lock().unwrap() {
                        break;
                    }
                    
                    // Every 3rd cycle, simulate a tag scan
                    counter += 1;
                    if counter % 3 == 0 {
                        // Cycle through the mock tags
                        let tag_index = (counter / 3) % mock_tags.len();
                        let tag_id = mock_tags[tag_index];
                        
                        let tag = RfidTag {
                            id: tag_id.to_string(),
                            timestamp: Utc::now().timestamp(),
                        };
                        
                        info!("📱 Mock RFID tag detected: {}", tag_id);
                        let _ = app_handle.emit_all("rfid-tag-scanned", tag);
                    }
                }
                
                info!("🔍 Mock RFID scanner stopped");
            }));
        }
        
        Ok(())
    }
    
    fn stop_scan(&mut self) -> Result<(), RfidError> {
        info!("Stopping RFID scanning");
        *self.scanning.lock().unwrap() = false;
        
        if let Some(thread) = self.scan_thread.take() {
            if let Err(e) = thread.join() {
                error!("Error joining RFID scan thread: {:?}", e);
            }
        }
        
        Ok(())
    }
    
    fn is_scanning(&self) -> bool {
        *self.scanning.lock().unwrap()
    }
}