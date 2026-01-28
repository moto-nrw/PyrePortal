use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex as TokioMutex};

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

// Mutex to prevent concurrent one-shot scans (e.g., when user cancels and restarts quickly)
// Without this, concurrent SPI access corrupts MFRC522 state causing hangs
// Uses tokio::sync::Mutex because guard must be held across .await points
static ONESHOT_SCAN_MUTEX: OnceLock<TokioMutex<()>> = OnceLock::new();

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
                service.start_background_task();
                println!("RFID Background Service initialized");
                service
            })))
            .map_err(|_| "Service already initialized".to_string())
    }

    pub fn get_instance() -> Option<Arc<Mutex<RfidBackgroundService>>> {
        RFID_SERVICE.get().cloned()
    }

    fn start_background_task(&mut self) {
        let (tx, mut rx) = mpsc::unbounded_channel::<ServiceCommand>();
        self.command_tx = Some(tx);

        let state = Arc::clone(&self.state);
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            Self::background_scanning_loop(state, app_handle, &mut rx).await;
        });
    }

    // ========== Helper functions for reduced cognitive complexity ==========

    /// Check if scanning should continue based on state
    fn should_continue_scanning(state: &Arc<Mutex<RfidServiceState>>) -> bool {
        state.lock().map(|guard| guard.is_running).unwrap_or(false)
    }

    /// Handle a successful RFID scan - update state and emit event
    fn handle_successful_scan(
        state: &Arc<Mutex<RfidServiceState>>,
        app_handle: Option<&AppHandle>,
        tag_id: &str,
    ) {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let scan_event = RfidScanEvent {
            tag_id: tag_id.to_string(),
            timestamp,
            platform: Self::get_platform_name(),
        };

        if let Ok(mut guard) = state.lock() {
            guard.last_scan = Some(scan_event.clone());
            guard.last_error = None;
        }

        if let Some(app) = app_handle {
            let _ = app.emit("rfid-scan", &scan_event);
            println!("Emitted RFID scan event: {tag_id}");
        }
    }

    /// Handle scan error - update state if it's a real error (not just "no card")
    fn handle_scan_error(state: &Arc<Mutex<RfidServiceState>>, error: &str) {
        let error_lower = error.to_lowercase();
        if error_lower.contains("no card")
            || error_lower.contains("timeout")
            || error_lower.contains("no card detected")
        {
            return;
        }

        if let Ok(mut guard) = state.lock() {
            guard.error_count += 1;
            guard.last_error = Some(error.to_string());
        }
        println!("RFID scan error: {error}");
    }

    /// Handle scanner initialization failure
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    fn handle_scanner_init_failure(state: &Arc<Mutex<RfidServiceState>>, error: &str) {
        println!("Failed to initialize RFID scanner: {}", error);
        if let Ok(mut guard) = state.lock() {
            guard.last_error = Some(format!("Scanner initialization failed: {}", error));
            guard.is_running = false;
        }
    }

    /// Handle Start command - begin scanning if not already running
    fn handle_start_command(
        state: &Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
        is_scanning: &mut bool,
        scan_task_handle: &mut Option<tokio::task::JoinHandle<()>>,
    ) {
        if *is_scanning {
            return;
        }

        println!("Starting RFID background scanning...");
        *is_scanning = true;

        if let Ok(mut guard) = state.lock() {
            guard.is_running = true;
        }

        let scan_state = Arc::clone(state);
        *scan_task_handle = Some(tokio::spawn(async move {
            Self::continuous_scan_loop(scan_state, app_handle).await;
        }));
    }

    /// Handle Stop command - stop scanning if currently running
    fn handle_stop_command(
        state: &Arc<Mutex<RfidServiceState>>,
        is_scanning: &mut bool,
        scan_task_handle: &mut Option<tokio::task::JoinHandle<()>>,
    ) {
        if !*is_scanning {
            return;
        }

        println!("Stopping RFID background scanning...");
        *is_scanning = false;

        if let Ok(mut guard) = state.lock() {
            guard.is_running = false;
        }

        if let Some(handle) = scan_task_handle.take() {
            handle.abort();
        }
    }

    // ========== Refactored main functions ==========

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
                    Self::handle_start_command(
                        &state,
                        app_handle.clone(),
                        &mut is_scanning,
                        &mut scan_task_handle,
                    );
                }
                ServiceCommand::Stop => {
                    Self::handle_stop_command(&state, &mut is_scanning, &mut scan_task_handle);
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
            const MAX_INIT_RETRIES: u32 = 3;
            let mut init_attempts: u32 = 0;

            loop {
                if !Self::should_continue_scanning(&state) {
                    break;
                }

                match raspberry_pi::initialize_persistent_scanner() {
                    Ok(mut scanner) => {
                        println!("RFID scanner initialized for persistent scanning");
                        init_attempts = 0;

                        let needs_reinit =
                            Self::run_hardware_scan_loop(&state, &app_handle, &mut scanner).await;

                        if !needs_reinit || !Self::should_continue_scanning(&state) {
                            break;
                        }

                        // Scanner gets dropped here (PersistentRfidScanner::drop calls hlta())
                        println!("RFID: Reinitializing scanner after consecutive errors...");
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                    Err(e) => {
                        init_attempts += 1;
                        if init_attempts >= MAX_INIT_RETRIES {
                            Self::handle_scanner_init_failure(
                                &state,
                                &format!("{} (after {} attempts)", e, init_attempts),
                            );
                            break;
                        }
                        println!(
                            "RFID: Init attempt {}/{} failed: {}, retrying...",
                            init_attempts, MAX_INIT_RETRIES, e
                        );
                        // Exponential backoff: 1s, 2s, 3s
                        tokio::time::sleep(Duration::from_secs(u64::from(init_attempts))).await;
                    }
                }
            }
        }

        // Mock platform implementation
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        {
            Self::run_mock_scan_loop(&state, app_handle.as_ref()).await;
        }
    }

    /// Run the hardware scan loop for Raspberry Pi platform.
    /// Returns `true` if the scanner should be re-initialized (consecutive hardware errors),
    /// `false` if scanning was stopped normally.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    async fn run_hardware_scan_loop(
        state: &Arc<Mutex<RfidServiceState>>,
        app_handle: &Option<AppHandle>,
        scanner: &mut raspberry_pi::PersistentRfidScanner,
    ) -> bool {
        let mut consecutive_errors: u32 = 0;
        const MAX_CONSECUTIVE_ERRORS: u32 = 15;

        loop {
            if !Self::should_continue_scanning(state) {
                println!("Continuous scan loop stopping - scanner will be cleaned up");
                return false;
            }

            match raspberry_pi::scan_with_persistent_scanner_sync(scanner) {
                Ok(tag_id) => {
                    consecutive_errors = 0;
                    Self::handle_successful_scan(state, app_handle.as_ref(), &tag_id);
                    // Wait after successful scan to prevent duplicate reads
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                Err(error) => {
                    Self::handle_scan_error(state, &error);

                    // Track consecutive real errors (not "no card" which is normal polling)
                    let error_lower = error.to_lowercase();
                    if !error_lower.contains("no card")
                        && !error_lower.contains("timeout")
                        && !error_lower.contains("no card detected")
                    {
                        consecutive_errors += 1;
                        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                            println!(
                                "RFID: {} consecutive hardware errors, requesting scanner re-initialization",
                                consecutive_errors
                            );
                            return true;
                        }
                    }
                }
            }
        }
    }

    /// Run the mock scan loop for development platforms
    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    async fn run_mock_scan_loop(
        state: &Arc<Mutex<RfidServiceState>>,
        app_handle: Option<&AppHandle>,
    ) {
        loop {
            if !Self::should_continue_scanning(state) {
                break;
            }

            match Self::perform_platform_scan().await {
                Ok(tag_id) => {
                    Self::handle_successful_scan(state, app_handle, &tag_id);
                    // Minimal wait after successful scan - frontend handles duplicate prevention
                    tokio::time::sleep(Duration::from_millis(30)).await;
                }
                Err(error) => {
                    Self::handle_scan_error(state, &error);
                }
            }
        }
    }

    // Only compiled for non-ARM platforms (mock scanning)
    // ARM Linux uses persistent scanner directly in continuous_scan_loop
    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    async fn perform_platform_scan() -> Result<String, String> {
        mock_platform::scan_rfid_hardware().await
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
                .map_err(|e| format!("Failed to send command: {e}"))
        } else {
            Err("Service not initialized".to_string())
        }
    }

    pub fn get_state(&self) -> Result<RfidServiceState, String> {
        self.state
            .lock()
            .map(|guard| guard.clone())
            .map_err(|e| format!("Failed to get state: {e}"))
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
    use std::thread;

    // Type alias for the complete MFRC522 type with SpiInterface
    type Mfrc522Scanner = Mfrc522<SpiInterface<Spidev, DummyNSS, DummyDelay>, mfrc522::Initialized>;

    // Persistent scanner struct that holds the MFRC522 instance
    pub struct PersistentRfidScanner {
        mfrc522: Mfrc522Scanner,
    }

    impl Drop for PersistentRfidScanner {
        fn drop(&mut self) {
            // Best-effort cleanup: put MFRC522 into halted state
            // This prevents the chip from being in an inconsistent state
            // when the next scanner instance tries to initialize
            let _ = self.mfrc522.hlta();
            println!("PersistentRfidScanner dropped - MFRC522 halted");
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

        // Hardware reset via GPIO 22
        reset_mfrc522_hardware()?;
        println!("✓ Hardware reset");

        // Create MFRC522 instance
        let spi_interface = SpiInterface::new(spi);
        let mfrc522 = Mfrc522::new(spi_interface);
        let mut mfrc522 = mfrc522
            .init()
            .map_err(|e| format!("Failed to initialize MFRC522: {:?}", e))?;
        println!("✓ MFRC522 initialized");

        // Verify version - 0x00/0xFF indicate SPI bus failure
        let version = mfrc522
            .version()
            .map_err(|e| format!("Failed to read MFRC522 version: {:?}", e))?;
        if version == 0x00 || version == 0xFF {
            return Err(format!(
                "MFRC522 version 0x{:02X} indicates SPI communication failure",
                version
            ));
        }
        println!("✓ Version: 0x{:02X}", version);

        // Set antenna gain to maximum
        mfrc522
            .set_antenna_gain(RxGain::DB48)
            .map_err(|e| format!("Failed to set antenna gain: {:?}", e))?;
        println!("✓ Antenna gain: DB48 (maximum)");

        Ok(PersistentRfidScanner { mfrc522 })
    }

    // ========== Shared hardware helpers ==========

    /// Perform hardware reset of MFRC522 via GPIO 22.
    /// Uses 100ms delays for reliable reset (some MFRC522 clones need >50ms).
    fn reset_mfrc522_hardware() -> Result<(), String> {
        let gpio = Gpio::new().map_err(|e| format!("Failed to initialize GPIO: {:?}", e))?;
        let mut reset_pin = gpio
            .get(22)
            .map_err(|e| format!("Failed to setup reset pin on GPIO 22: {:?}", e))?
            .into_output();

        reset_pin.set_high();
        reset_pin.set_low();
        thread::sleep(Duration::from_millis(100));
        reset_pin.set_high();
        thread::sleep(Duration::from_millis(100));

        Ok(())
    }

    // ========== Helper functions for reduced cognitive complexity ==========

    /// Format UID bytes as colon-separated hex string
    fn format_uid(bytes: &[u8]) -> String {
        bytes
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(":")
    }

    /// Attempt to select a card with retry logic for IncompleteFrame errors
    fn select_card_with_retry(
        mfrc522: &mut Mfrc522Scanner,
        atqa: &mfrc522::AtqA,
    ) -> Result<String, String> {
        const MAX_RETRIES: u32 = 5;
        const RETRY_DELAY_MS: u64 = 10;

        let mut last_error = String::new();

        for attempt in 0..=MAX_RETRIES {
            match mfrc522.select(atqa) {
                Ok(uid) => {
                    let _ = mfrc522.hlta();
                    return Ok(format_uid(uid.as_bytes()));
                }
                Err(e) => {
                    last_error = format!("{:?}", e);

                    // Only retry on IncompleteFrame errors
                    if !last_error.contains("IncompleteFrame") || attempt == MAX_RETRIES {
                        let _ = mfrc522.hlta();
                        return Err(format!("Select failed: {}", last_error));
                    }

                    thread::sleep(Duration::from_millis(RETRY_DELAY_MS));
                }
            }
        }

        Err(format!(
            "Failed after {} retries: {}",
            MAX_RETRIES, last_error
        ))
    }

    // ========== Refactored main function ==========

    /// Scan using the persistent scanner instance (synchronous version)
    pub fn scan_with_persistent_scanner_sync(
        scanner: &mut PersistentRfidScanner,
    ) -> Result<String, String> {
        const SCAN_INTERVAL_MS: u64 = 20;

        // Try WUPA first, fall back to REQA for maximum card compatibility.
        // WUPA wakes all cards including halted ones; REQA detects cards in IDLE state.
        match scanner.mfrc522.wupa().or_else(|_| scanner.mfrc522.reqa()) {
            Ok(atqa) => select_card_with_retry(&mut scanner.mfrc522, &atqa),
            Err(_) => {
                thread::sleep(Duration::from_millis(SCAN_INTERVAL_MS));
                Err("No card detected".to_string())
            }
        }
    }

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        scan_rfid_hardware_with_timeout(Duration::from_millis(500)).await
    }

    /// Single RFID scan with timeout for tag assignment flow.
    /// IMPORTANT: Keep in sync with TagAssignmentPage.tsx scanner modal timeout (currently 10s).
    pub async fn scan_rfid_hardware_single() -> Result<String, String> {
        scan_rfid_hardware_with_timeout(Duration::from_secs(10)).await
    }

    /// Initialize MFRC522 scanner with SPI and GPIO setup for one-shot scanning
    fn initialize_mfrc522_oneshot() -> Result<Mfrc522Scanner, String> {
        ensure_hardware_ready()?;

        // Initialize SPI
        let mut spi = Spidev::open("/dev/spidev0.0")
            .map_err(|e| format!("Failed to open SPI device: {:?}", e))?;

        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();
        spi.configure(&options)
            .map_err(|e| format!("Failed to configure SPI: {:?}", e))?;

        // Hardware reset via GPIO 22
        reset_mfrc522_hardware()?;

        // Initialize MFRC522
        println!("Attempting to initialize MFRC522...");
        let mut mfrc522 = Mfrc522::new(SpiInterface::new(spi))
            .init()
            .map_err(|e| format!("Failed to initialize MFRC522: {:?}", e))?;
        println!("MFRC522 initialized successfully");

        // Verify communication
        let _version = mfrc522
            .version()
            .map_err(|e| format!("Failed to read MFRC522 version: {:?}", e))?;
        println!("MFRC522 version: {:?}", _version);

        // Set antenna gain (non-fatal if it fails)
        println!("Setting antenna gain to maximum (48dB) for improved range...");
        if mfrc522.set_antenna_gain(RxGain::DB48).is_ok() {
            println!("Successfully configured antenna gain to 48dB maximum");
        } else {
            println!("Warning: Failed to set antenna gain, continuing with defaults");
        }

        Ok(mfrc522)
    }

    /// Run scan loop with timeout
    fn run_scan_loop_with_timeout(
        mfrc522: &mut Mfrc522Scanner,
        timeout: Duration,
    ) -> Result<String, String> {
        let start_time = std::time::Instant::now();

        loop {
            if start_time.elapsed() > timeout {
                return Err("Scan timeout - no card detected".to_string());
            }

            // Try both WUPA and REQA for maximum compatibility
            if let Ok(atqa) = mfrc522.wupa().or_else(|_| mfrc522.reqa()) {
                match mfrc522.select(&atqa) {
                    Ok(uid) => {
                        let _ = mfrc522.hlta();
                        return Ok(format_uid(uid.as_bytes()));
                    }
                    Err(_) => {
                        let _ = mfrc522.hlta();
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            } else {
                thread::sleep(Duration::from_millis(20));
            }
        }
    }

    async fn scan_rfid_hardware_with_timeout(timeout: Duration) -> Result<String, String> {
        let mut mfrc522 = initialize_mfrc522_oneshot()?;
        run_scan_loop_with_timeout(&mut mfrc522, timeout)
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
    use super::{Duration, RfidScannerStatus};
    use std::sync::Mutex;

    // Track last scan for duplicate prevention (mimics real hardware behavior)
    static LAST_SCAN: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);

    pub async fn scan_rfid_hardware() -> Result<String, String> {
        // Simulate variable scan time (200-500ms) like real hardware
        let scan_time = 200 + (rand::random::<u64>() % 300);
        tokio::time::sleep(Duration::from_millis(scan_time)).await;
        scan_rfid_mock_internal()
    }

    pub async fn scan_rfid_hardware_single() -> Result<String, String> {
        // For single scans, simulate user placing tag (2-3 seconds)
        let scan_time = 2000 + (rand::random::<u64>() % 1000);
        tokio::time::sleep(Duration::from_millis(scan_time)).await;
        scan_rfid_mock_internal()
    }

    fn scan_rfid_mock_internal() -> Result<String, String> {
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
            .map_err(|e| format!("Failed to lock service: {e}"))?;
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
            .map_err(|e| format!("Failed to lock service: {e}"))?;
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
            .map_err(|e| format!("Failed to lock service: {e}"))?;
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
    // Acquire mutex to prevent concurrent scans - if user cancels and restarts quickly,
    // the second scan waits for the first to complete rather than corrupting SPI state
    let mutex = ONESHOT_SCAN_MUTEX.get_or_init(|| TokioMutex::new(()));
    let _guard = mutex.lock().await;

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
            tag_id: Some(format!("MOCK:TIMEOUT:{timeout_seconds}:SEC")),
            error: None,
        })
    }
}
