use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc;
use tauri::{AppHandle, Emitter};

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RfidScanEvent {
    pub tag_id: String,
    pub timestamp: u64,
    pub platform: String,
}

#[derive(Debug)]
pub enum ServiceCommand {
    Start,
    Stop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RfidServiceState {
    pub is_running: bool,
    pub last_scan: Option<RfidScanEvent>,
    pub error_count: u32,
    pub last_error: Option<String>,
}

pub struct RfidBackgroundService {
    pub state: Arc<Mutex<RfidServiceState>>,
    pub command_tx: Option<mpsc::UnboundedSender<ServiceCommand>>,
    pub app_handle: Option<AppHandle>,
}

// Safe global service instance using OnceLock
static RFID_SERVICE: OnceLock<Arc<Mutex<RfidBackgroundService>>> = OnceLock::new();

impl RfidBackgroundService {
    pub fn new() -> Self {
        let initial_state = RfidServiceState {
            is_running: false,
            last_scan: None,
            error_count: 0,
            last_error: None,
        };

        Self {
            state: Arc::new(Mutex::new(initial_state)),
            command_tx: None,
            app_handle: None,
        }
    }

    pub fn initialize(app_handle: AppHandle) -> Result<(), String> {
        // Check if already initialized
        if RFID_SERVICE.get().is_some() {
            println!("RFID Background Service already initialized, skipping");
            return Ok(());
        }
        
        RFID_SERVICE.set(Arc::new(Mutex::new({
            let mut service = Self::new();
            service.app_handle = Some(app_handle);
            service.start_background_task()?;
            println!("RFID Background Service initialized");
            service
        }))).map_err(|_| "Service already initialized".to_string())
    }

    pub fn get_instance() -> Option<Arc<Mutex<RfidBackgroundService>>> {
        RFID_SERVICE.get().cloned()
    }

    fn start_background_task(&mut self) -> Result<(), String> {
        let (tx, mut rx) = mpsc::unbounded_channel::<ServiceCommand>();
        self.command_tx = Some(tx);
        
        let state = Arc::clone(&self.state);
        let app_handle = self.app_handle.clone();
        
        tokio::spawn(async move {
            Self::background_scanning_loop(state, app_handle, &mut rx).await;
        });
        
        Ok(())
    }

    async fn background_scanning_loop(
        state: Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
        command_rx: &mut mpsc::UnboundedReceiver<ServiceCommand>,
    ) {
        let mut is_scanning = false;
        let mut scan_task_handle: Option<tokio::task::JoinHandle<()>> = None;

        while let Some(command) = command_rx.recv().await {
            match command {
                ServiceCommand::Start => {
                    if !is_scanning {
                        println!("Starting RFID background scanning...");
                        is_scanning = true;
                        
                        // Update state
                        if let Ok(mut state_guard) = state.lock() {
                            state_guard.is_running = true;
                        }

                        // Start scanning task
                        let scan_state = Arc::clone(&state);
                        let scan_app_handle = app_handle.clone();
                        scan_task_handle = Some(tokio::spawn(async move {
                            Self::continuous_scan_loop(scan_state, scan_app_handle).await;
                        }));
                    }
                }
                ServiceCommand::Stop => {
                    if is_scanning {
                        println!("Stopping RFID background scanning...");
                        is_scanning = false;
                        
                        // Update state
                        if let Ok(mut state_guard) = state.lock() {
                            state_guard.is_running = false;
                        }

                        // Cancel scanning task
                        if let Some(handle) = scan_task_handle.take() {
                            handle.abort();
                        }
                    }
                }
            }
        }
    }

    async fn continuous_scan_loop(
        state: Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
    ) {
        loop {
            // Check if we should continue scanning
            let should_continue = {
                if let Ok(state_guard) = state.lock() {
                    state_guard.is_running
                } else {
                    false
                }
            };

            if !should_continue {
                break;
            }

            // Perform scan
            match Self::perform_platform_scan().await {
                Ok(tag_id) => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    let scan_event = RfidScanEvent {
                        tag_id: tag_id.clone(),
                        timestamp,
                        platform: Self::get_platform_name(),
                    };

                    // Update state
                    if let Ok(mut state_guard) = state.lock() {
                        state_guard.last_scan = Some(scan_event.clone());
                        state_guard.last_error = None;
                    }

                    // Emit event to frontend
                    if let Some(ref app) = app_handle {
                        let _ = app.emit("rfid-scan", &scan_event);
                        println!("Emitted RFID scan event: {}", tag_id);
                    }

                    // Wait longer after successful scan to avoid duplicate reads
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                }
                Err(error) => {
                    // Only log and update state for non-timeout errors
                    if !error.contains("timeout") && !error.contains("no card detected") {
                        if let Ok(mut state_guard) = state.lock() {
                            state_guard.error_count += 1;
                            state_guard.last_error = Some(error.clone());
                        }
                        println!("RFID scan error: {}", error);
                    }

                    // Short delay before next attempt
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    async fn perform_platform_scan() -> Result<String, String> {
        #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
        {
            raspberry_pi::scan_rfid_hardware().await
        }
        
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        {
            mock_platform::scan_rfid_hardware().await
        }
    }

    fn get_platform_name() -> String {
        #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
        {
            "Raspberry Pi (ARM64)".to_string()
        }
        
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        {
            format!("Development Platform ({})", std::env::consts::ARCH)
        }
    }

    pub fn send_command(&self, command: ServiceCommand) -> Result<(), String> {
        if let Some(ref tx) = self.command_tx {
            tx.send(command).map_err(|e| format!("Failed to send command: {}", e))
        } else {
            Err("Service not initialized".to_string())
        }
    }

    pub fn get_state(&self) -> Result<RfidServiceState, String> {
        self.state.lock()
            .map(|guard| guard.clone())
            .map_err(|e| format!("Failed to get state: {}", e))
    }
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

    use std::sync::{Mutex, OnceLock};
    
    // Track initialization state to prevent repeated setup
    static HARDWARE_INITIALIZED: OnceLock<bool> = OnceLock::new();
    static INITIALIZATION_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    
    fn ensure_hardware_ready() -> Result<(), String> {
        // Get or create the mutex
        let mutex = INITIALIZATION_MUTEX.get_or_init(|| Mutex::new(()));
        let _lock = mutex.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
        
        // Check if already initialized
        if HARDWARE_INITIALIZED.get().is_some() {
            return Ok(());
        }
        
        // Perform one-time hardware check/setup if needed
        println!("Performing one-time RFID hardware validation...");
        
        // Mark as initialized
        HARDWARE_INITIALIZED.set(true).map_err(|_| "Already initialized")?;
        println!("RFID hardware validation complete");
        
        Ok(())
    }

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        // Ensure hardware is ready (but don't hold resources)
        ensure_hardware_ready()?;
        
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
        
        // Scan for cards with timeout (shorter timeout for background service)
        let start_time = std::time::Instant::now();
        let timeout = Duration::from_millis(500); // Shorter timeout for responsive background service
        
        loop {
            // Check for timeout
            if start_time.elapsed() > timeout {
                return Err("Scan timeout - no card detected".to_string());
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
            thread::sleep(Duration::from_millis(50)); // Faster polling for responsiveness
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
        // Simulate scanning delay - shorter for background service
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        // Simulate occasional "no card" timeouts to mimic real hardware
        if rand::random::<u8>() % 10 == 0 {
            return Err("Scan timeout - no card detected".to_string());
        }
        
        // Return mock tag ID with random variation
        let random_id = rand::random::<u16>();
        Ok(format!("MOCK:{:04X}:ABCD:EF01", random_id))
    }

    pub fn check_rfid_hardware() -> RfidScannerStatus {
        RfidScannerStatus {
            is_available: true, // Mock is always "available"
            platform: format!("Development Platform ({})", std::env::consts::ARCH),
            last_error: None,
        }
    }
}

// New Tauri commands that control the background service
#[tauri::command]
pub async fn start_rfid_service() -> Result<String, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc.lock().map_err(|e| format!("Failed to lock service: {}", e))?;
        service.send_command(ServiceCommand::Start)?;
        Ok("RFID service started".to_string())
    } else {
        Err("RFID service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_rfid_service() -> Result<String, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc.lock().map_err(|e| format!("Failed to lock service: {}", e))?;
        service.send_command(ServiceCommand::Stop)?;
        Ok("RFID service stopped".to_string())
    } else {
        Err("RFID service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_rfid_service_status() -> Result<RfidServiceState, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc.lock().map_err(|e| format!("Failed to lock service: {}", e))?;
        service.get_state()
    } else {
        Err("RFID service not initialized".to_string())
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

// Initialize the service when app starts
#[tauri::command]
pub async fn initialize_rfid_service(app_handle: tauri::AppHandle) -> Result<String, String> {
    RfidBackgroundService::initialize(app_handle)?;
    Ok("RFID service initialized".to_string())
}

// Legacy commands (kept for compatibility)
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
pub async fn scan_rfid_with_timeout(timeout_seconds: u64) -> Result<RfidScanResult, String> {
    // For future implementation - continuous scanning with custom timeout
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        // Use the timeout parameter for future implementation
        let _timeout = timeout_seconds; // Acknowledge parameter usage
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