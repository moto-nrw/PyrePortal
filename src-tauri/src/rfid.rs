use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

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

        RFID_SERVICE
            .set(Arc::new(Mutex::new({
                let mut service = Self::new();
                service.app_handle = Some(app_handle);
                service.start_background_task()?;
                println!("RFID Background Service initialized");
                service
            })))
            .map_err(|_| "Service already initialized".to_string())
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
        // Platform-specific scanning implementation
        #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
        {
            // Initialize hardware once for the entire scanning session
            match raspberry_pi::initialize_persistent_scanner() {
                Ok(mut scanner) => {
                    println!("RFID scanner initialized for persistent scanning");

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

                        // Perform scan with persistent scanner
                        match raspberry_pi::scan_with_persistent_scanner_sync(&mut scanner) {
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

                                // Wait after successful scan to prevent duplicate reads
                                tokio::time::sleep(Duration::from_millis(200)).await;
                            }
                            Err(error) => {
                                // Only log and update state for non-timeout errors
                                if !error.contains("No card") {
                                    if let Ok(mut state_guard) = state.lock() {
                                        state_guard.error_count += 1;
                                        state_guard.last_error = Some(error.clone());
                                    }
                                    // Only print errors that aren't just "no card" messages
                                    if !error.contains("No card") {
                                        println!("RFID scan error: {}", error);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    println!("Failed to initialize RFID scanner: {}", e);
                    if let Ok(mut state_guard) = state.lock() {
                        state_guard.last_error =
                            Some(format!("Scanner initialization failed: {}", e));
                        state_guard.is_running = false;
                    }
                }
            }
        }

        // Mock platform implementation remains the same
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        {
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

                        // Minimal wait after successful scan - frontend handles duplicate prevention
                        tokio::time::sleep(Duration::from_millis(30)).await;
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
                        // No additional delay needed - our adaptive polling in scan_rfid_hardware_with_timeout handles timing
                    }
                }
            }
        }
    }

    async fn perform_platform_scan() -> Result<String, String> {
        #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
        {
            // Use longer timeout for continuous scanning - we'll return quickly when card is found
            raspberry_pi::scan_rfid_hardware_continuous().await
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
            tx.send(command)
                .map_err(|e| format!("Failed to send command: {}", e))
        } else {
            Err("Service not initialized".to_string())
        }
    }

    pub fn get_state(&self) -> Result<RfidServiceState, String> {
        self.state
            .lock()
            .map(|guard| guard.clone())
            .map_err(|e| format!("Failed to get state: {}", e))
    }
}

// Platform-specific RFID implementation for Raspberry Pi
#[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
mod raspberry_pi {
    use super::*;
    use linux_embedded_hal::{
        spidev::{SpiModeFlags, SpidevOptions},
        Spidev,
    };
    use mfrc522::{
        comm::eh02::spi::{DummyDelay, DummyNSS, SpiInterface},
        Mfrc522, RxGain,
    };
    use rppal::gpio::Gpio;
    use std::{error::Error, fmt, thread};

    // Type alias for the complete MFRC522 type with SpiInterface
    type Mfrc522Scanner = Mfrc522<SpiInterface<Spidev, DummyNSS, DummyDelay>, mfrc522::Initialized>;

    // Persistent scanner struct that holds the MFRC522 instance
    pub struct PersistentRfidScanner {
        mfrc522: Mfrc522Scanner,
    }

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
        let _lock = mutex
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;

        // Check if already initialized
        if HARDWARE_INITIALIZED.get().is_some() {
            return Ok(());
        }

        // Perform one-time hardware check/setup if needed
        println!("Performing one-time RFID hardware validation...");

        // Mark as initialized
        HARDWARE_INITIALIZED
            .set(true)
            .map_err(|_| "Already initialized")?;
        println!("RFID hardware validation complete");

        Ok(())
    }

    // Initialize a persistent RFID scanner instance
    pub fn initialize_persistent_scanner() -> Result<PersistentRfidScanner, String> {
        println!("Initializing persistent RFID scanner...");

        // Initialize SPI device
        let mut spi = Spidev::open("/dev/spidev0.0")
            .map_err(|e| format!("Failed to open SPI device 0.0: {:?}", e))?;
        println!("✓ SPI opened");

        // SPI configuration - 1MHz for maximum detection range
        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000) // 1MHz - matches test_rfid_persistent
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();
        spi.configure(&options)
            .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;
        println!("✓ SPI configured at 1MHz");

        // Setup GPIO
        let gpio = Gpio::new().map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;
        let mut reset_pin = gpio
            .get(22)
            .map_err(|e| format!("Failed to setup reset pin on GPIO 22: {:?}", e))?
            .into_output();

        // Hardware reset
        reset_pin.set_high();
        reset_pin.set_low();
        thread::sleep(Duration::from_millis(50));
        reset_pin.set_high();
        thread::sleep(Duration::from_millis(50));
        println!("✓ Hardware reset");

        // Create MFRC522 instance
        let spi_interface = SpiInterface::new(spi);
        let mfrc522 = Mfrc522::new(spi_interface);
        let mut mfrc522 = mfrc522
            .init()
            .map_err(|e| format!("Failed to initialize MFRC522: {:?}", e))?;
        println!("✓ MFRC522 initialized");

        // Verify version
        if let Ok(v) = mfrc522.version() {
            println!("✓ Version: 0x{:02X}", v);
        }

        // Set antenna gain to maximum
        mfrc522
            .set_antenna_gain(RxGain::DB48)
            .map_err(|e| format!("Failed to set antenna gain: {:?}", e))?;
        println!("✓ Antenna gain: DB48 (maximum)");

        Ok(PersistentRfidScanner { mfrc522 })
    }

    // Scan using the persistent scanner instance (synchronous version)
    pub fn scan_with_persistent_scanner_sync(
        scanner: &mut PersistentRfidScanner,
    ) -> Result<String, String> {
        const SCAN_INTERVAL_MS: u64 = 20; // Matches test_rfid_persistent
        const RETRY_DELAY_MS: u64 = 10; // Delay between retries
        const MAX_RETRIES: u32 = 5; // Maximum retry attempts for IncompleteFrame

        // Try WUPA
        match scanner.mfrc522.wupa() {
            Ok(atqa) => {
                // Try to select the card
                match scanner.mfrc522.select(&atqa) {
                    Ok(uid) => {
                        let uid_bytes = uid.as_bytes();
                        let uid_hex: Vec<String> =
                            uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();

                        // Always halt the card
                        let _ = scanner.mfrc522.hlta();

                        Ok(uid_hex.join(":"))
                    }
                    Err(e) => {
                        // Check if it's an IncompleteFrame error
                        let error_str = format!("{:?}", e);
                        if error_str.contains("IncompleteFrame") {
                            // Retry logic for IncompleteFrame errors
                            let mut retry_count = 0;

                            while retry_count < MAX_RETRIES {
                                // Small delay between retries
                                thread::sleep(Duration::from_millis(RETRY_DELAY_MS));
                                retry_count += 1;

                                match scanner.mfrc522.select(&atqa) {
                                    Ok(uid) => {
                                        let uid_bytes = uid.as_bytes();
                                        let uid_hex: Vec<String> = uid_bytes
                                            .iter()
                                            .map(|b| format!("{:02X}", b))
                                            .collect();

                                        let _ = scanner.mfrc522.hlta();
                                        return Ok(uid_hex.join(":"));
                                    }
                                    Err(e) => {
                                        if retry_count == MAX_RETRIES {
                                            let _ = scanner.mfrc522.hlta();
                                            return Err(format!(
                                                "Failed after {} retries: {:?}",
                                                MAX_RETRIES, e
                                            ));
                                        }
                                    }
                                }
                            }
                        }

                        // Not an IncompleteFrame error or retries exhausted
                        let _ = scanner.mfrc522.hlta();
                        Err(format!("Select failed: {:?}", e))
                    }
                }
            }
            Err(_) => {
                // No card detected - wait before next scan
                thread::sleep(Duration::from_millis(SCAN_INTERVAL_MS));
                Err("No card detected".to_string())
            }
        }
    }

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        scan_rfid_hardware_with_timeout(Duration::from_millis(500)).await
    }

    pub async fn scan_rfid_hardware_single() -> Result<String, String> {
        scan_rfid_hardware_with_timeout(Duration::from_secs(5)).await
    }

    // Optimized for continuous background scanning
    pub async fn scan_rfid_hardware_continuous() -> Result<String, String> {
        // Use a longer timeout but with adaptive polling for efficiency
        scan_rfid_hardware_with_timeout(Duration::from_secs(30)).await
    }

    async fn scan_rfid_hardware_with_timeout(timeout: Duration) -> Result<String, String> {
        // Ensure hardware is ready (but don't hold resources)
        ensure_hardware_ready()?;

        // Initialize SPI device - matches Python implementation settings
        let mut spi = match Spidev::open("/dev/spidev0.0") {
            Ok(s) => s,
            Err(e) => {
                return Err(format!("Failed to open SPI device 0.0: {:?}", e));
            }
        };

        // SPI configuration - 1MHz for maximum detection range
        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000) // 1MHz - best range, matches original Python implementation
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
            Err(e) => {
                return Err(format!(
                    "Failed to setup reset pin on GPIO {}: {:?}",
                    reset_pin_number, e
                ))
            }
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
            }
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
            }
            Err(e) => {
                println!("Failed to read MFRC522 version: {:?}", e);
                return Err(format!("Failed to read MFRC522 version: {:?}", e));
            }
        };

        // Set antenna gain to maximum for better reading sensitivity
        println!("Setting antenna gain to maximum (48dB) for improved range...");

        if let Err(e) = mfrc522.set_antenna_gain(RxGain::DB48) {
            println!("Warning: Failed to set antenna gain: {:?}", e);
            println!("RFID will continue with default gain settings");
        } else {
            println!("Successfully configured antenna gain to 48dB maximum");
        }

        // Scan for cards with timeout
        let start_time = std::time::Instant::now();

        loop {
            // Check for timeout
            if start_time.elapsed() > timeout {
                return Err("Scan timeout - no card detected".to_string());
            }

            // Try both WUPA and REQA for maximum compatibility
            let atqa_result = mfrc522.wupa().or_else(|_| mfrc522.reqa());

            if let Ok(atqa) = atqa_result {
                // Select card
                match mfrc522.select(&atqa) {
                    Ok(uid) => {
                        // Convert UID bytes to hex string
                        let uid_bytes = uid.as_bytes();
                        let uid_hex: Vec<String> =
                            uid_bytes.iter().map(|b| format!("{:02X}", b)).collect();

                        // Go back to idle state
                        let _ = mfrc522.hlta();

                        return Ok(uid_hex.join(":"));
                    }
                    Err(_) => {
                        // Select failed, ensure card is halted before retry
                        let _ = mfrc522.hlta();
                        // Give the card time to reset
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            } else {
                // No card detected, use shorter sleep
                thread::sleep(Duration::from_millis(20));
            }
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
    use std::sync::Mutex;

    // Track last scan for duplicate prevention (mimics real hardware behavior)
    static LAST_SCAN: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        // Simulate variable scan time (200-500ms) like real hardware
        let scan_time = 200 + (rand::random::<u64>() % 300);
        tokio::time::sleep(Duration::from_millis(scan_time)).await;
        scan_rfid_mock_internal().await
    }

    pub async fn scan_rfid_hardware_single() -> Result<String, String> {
        // For single scans, simulate user placing tag (2-3 seconds)
        let scan_time = 2000 + (rand::random::<u64>() % 1000);
        tokio::time::sleep(Duration::from_millis(scan_time)).await;
        scan_rfid_mock_internal().await
    }

    async fn scan_rfid_mock_internal() -> Result<String, String> {
        // Check for duplicate read (2-second cooldown like real hardware)
        let mut last_scan = LAST_SCAN.lock().unwrap();
        if let Some((last_tag, last_time)) = &*last_scan {
            if last_time.elapsed() < Duration::from_secs(2) {
                // 90% chance return same tag (card still present), 10% card was removed
                if !rand::random::<u8>().is_multiple_of(10) {
                    return Ok(last_tag.clone());
                }
            }
        }

        // 5% error rate (more realistic than 10%)
        if rand::random::<u8>().is_multiple_of(20) {
            return Err("Scan timeout - no card detected".to_string());
        }

        // Use realistic hardware format tags
        let mock_tags = [
            "04:D6:94:82:97:6A:80",
            "04:A7:B3:C2:D1:E0:F5",
            "04:12:34:56:78:9A:BC",
            "04:FE:DC:BA:98:76:54",
            "04:11:22:33:44:55:66",
        ];

        // Pick a random tag from the list
        let tag_index = (rand::random::<u8>() as usize) % mock_tags.len();
        let tag = mock_tags[tag_index].to_string();

        // Update last scan state
        *last_scan = Some((tag.clone(), std::time::Instant::now()));
        Ok(tag)
    }

    pub fn check_rfid_hardware() -> RfidScannerStatus {
        // Log that we're using mock implementation
        println!("[RFID] Using mock implementation with hardware format (XX:XX:XX:XX:XX:XX:XX)");

        RfidScannerStatus {
            is_available: true, // Mock is always "available"
            platform: format!(
                "Development Platform ({}) - MOCK Hardware Format",
                std::env::consts::ARCH
            ),
            last_error: None,
        }
    }
}

// New Tauri commands that control the background service
#[tauri::command]
pub async fn start_rfid_service() -> Result<String, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc
            .lock()
            .map_err(|e| format!("Failed to lock service: {}", e))?;
        service.send_command(ServiceCommand::Start)?;
        Ok("RFID service started".to_string())
    } else {
        Err("RFID service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_rfid_service() -> Result<String, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc
            .lock()
            .map_err(|e| format!("Failed to lock service: {}", e))?;
        service.send_command(ServiceCommand::Stop)?;
        Ok("RFID service stopped".to_string())
    } else {
        Err("RFID service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_rfid_service_status() -> Result<RfidServiceState, String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let service = service_arc
            .lock()
            .map_err(|e| format!("Failed to lock service: {}", e))?;
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
        Ok(mock_platform::check_rfid_hardware())
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
        match raspberry_pi::scan_rfid_hardware_single().await {
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
        match mock_platform::scan_rfid_hardware_single().await {
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
        raspberry_pi::scan_rfid_hardware()
            .await
            .map(|tag_id| RfidScanResult {
                success: true,
                tag_id: Some(tag_id),
                error: None,
            })
            .or_else(|error| {
                Ok(RfidScanResult {
                    success: false,
                    tag_id: None,
                    error: Some(error),
                })
            })
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
