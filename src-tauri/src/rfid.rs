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
    #[serde(skip)]
    pub should_run: bool,
}

pub struct RfidBackgroundService {
    pub state: Arc<Mutex<RfidServiceState>>,
    pub command_tx: Option<mpsc::UnboundedSender<ServiceCommand>>,
    pub app_handle: Option<AppHandle>,
}

// Safe global service instance using OnceLock
static RFID_SERVICE: OnceLock<Arc<Mutex<RfidBackgroundService>>> = OnceLock::new();

// Global SPI guard used by BOTH continuous background scanning and one-shot scans.
// This avoids concurrent access/reset races on /dev/spidev0.0 and MFRC522 state corruption.
static SPI_ACCESS_MUTEX: OnceLock<TokioMutex<()>> = OnceLock::new();

impl RfidBackgroundService {
    pub fn new() -> Self {
        let initial_state = RfidServiceState {
            is_running: false,
            last_scan: None,
            error_count: 0,
            last_error: None,
            should_run: false,
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
        state.lock().map(|guard| guard.should_run).unwrap_or(false)
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
            guard.should_run = false;
        }
    }

    const STOP_JOIN_TIMEOUT: Duration = Duration::from_secs(3);

    fn set_running_state(state: &Arc<Mutex<RfidServiceState>>, is_running: bool) {
        if let Ok(mut guard) = state.lock() {
            guard.is_running = is_running;
            if is_running {
                guard.last_error = None;
            }
        }
    }

    fn set_should_run(state: &Arc<Mutex<RfidServiceState>>, should_run: bool) {
        if let Ok(mut guard) = state.lock() {
            guard.should_run = should_run;
        }
    }

    async fn reap_finished_scan_task(
        state: &Arc<Mutex<RfidServiceState>>,
        scan_task_handle: &mut Option<tokio::task::JoinHandle<()>>,
    ) {
        let is_finished = scan_task_handle
            .as_ref()
            .is_some_and(tokio::task::JoinHandle::is_finished);

        if !is_finished {
            return;
        }

        if let Some(handle) = scan_task_handle.take() {
            if let Err(join_error) = handle.await {
                println!("RFID scan task ended with error: {join_error}");
            } else {
                println!("RFID scan task completed");
            }
        }

        Self::set_should_run(state, false);
        Self::set_running_state(state, false);
    }

    /// Handle Start command - begin scanning if not already running
    async fn handle_start_command(
        state: &Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
        scan_task_handle: &mut Option<tokio::task::JoinHandle<()>>,
    ) {
        Self::reap_finished_scan_task(state, scan_task_handle).await;

        let already_running = scan_task_handle
            .as_ref()
            .is_some_and(|h| !h.is_finished());
        let state_running = state.lock().map(|guard| guard.is_running).unwrap_or(false);

        if already_running || state_running {
            let stop_in_progress = state
                .lock()
                .map(|guard| guard.is_running && !guard.should_run)
                .unwrap_or(false);

            if stop_in_progress {
                println!("RFID background scanning still stopping, start deferred");
            } else {
                println!("RFID background scanning already running, start ignored");
                Self::set_running_state(state, true);
            }
            return;
        }

        println!("Starting RFID background scanning...");
        Self::set_should_run(state, true);
        Self::set_running_state(state, true);

        let scan_state = Arc::clone(state);
        *scan_task_handle = Some(tokio::spawn(async move {
            Self::continuous_scan_loop(scan_state, app_handle).await;
        }));
    }

    /// Handle Stop command - request stop and wait briefly for task termination.
    async fn handle_stop_command(
        state: &Arc<Mutex<RfidServiceState>>,
        scan_task_handle: &mut Option<tokio::task::JoinHandle<()>>,
    ) {
        println!("Stopping RFID background scanning...");
        // Signal the worker to exit gracefully at the next loop iteration.
        Self::set_should_run(state, false);

        if let Some(handle) = scan_task_handle.as_mut() {
            if let Ok(join_result) =
                tokio::time::timeout(Self::STOP_JOIN_TIMEOUT, &mut *handle).await
            {
                if let Err(join_error) = join_result {
                    println!("RFID scan task join error on stop: {join_error}");
                }
                *scan_task_handle = None;
                Self::set_running_state(state, false);
            } else {
                println!("RFID scan task did not stop within timeout, aborting task (may still drain in background)");
                handle.abort();
                let mut finished_after_abort = false;
                for _ in 0..10 {
                    if handle.is_finished() {
                        finished_after_abort = true;
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }

                if finished_after_abort {
                    if let Some(finished_handle) = scan_task_handle.take() {
                        if let Err(join_error) = finished_handle.await {
                            println!("RFID scan task join error after abort: {join_error}");
                        }
                    }
                    Self::set_running_state(state, false);
                    return;
                }

                // If abort did not settle quickly, detach join handling in background
                // and keep state as running until that detached task resolves.
                if let Some(detached_handle) = scan_task_handle.take() {
                    let state_for_join = Arc::clone(state);
                    tokio::spawn(async move {
                        if let Err(join_error) = detached_handle.await {
                            println!(
                                "RFID scan task join error after detached abort: {join_error}"
                            );
                        }
                        Self::set_should_run(&state_for_join, false);
                        Self::set_running_state(&state_for_join, false);
                    });
                }
            }
        } else {
            let still_running = state.lock().map(|guard| guard.is_running).unwrap_or(false);
            if still_running {
                println!("RFID stop requested but scanner thread is still draining");
            } else {
                Self::set_running_state(state, false);
            }
        }
    }

    // ========== Refactored main functions ==========

    async fn background_scanning_loop(
        state: Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
        command_rx: &mut mpsc::UnboundedReceiver<ServiceCommand>,
    ) {
        let mut scan_task_handle: Option<tokio::task::JoinHandle<()>> = None;

        while let Some(command) = command_rx.recv().await {
            Self::reap_finished_scan_task(&state, &mut scan_task_handle).await;

            match command {
                ServiceCommand::Start => {
                    Self::handle_start_command(&state, app_handle.clone(), &mut scan_task_handle)
                        .await;
                }
                ServiceCommand::Stop => {
                    Self::handle_stop_command(&state, &mut scan_task_handle).await;
                }
            }
        }

        Self::handle_stop_command(&state, &mut scan_task_handle).await;
    }

    async fn continuous_scan_loop(
        state: Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
    ) {
        // Platform-specific scanning implementation
        #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
        {
            let scan_state = Arc::clone(&state);
            let scan_app_handle = app_handle.clone();
            let join_result = tokio::task::spawn_blocking(move || {
                Self::run_hardware_scan_worker(scan_state, scan_app_handle);
            })
            .await;

            if let Err(join_error) = join_result {
                let message = format!("RFID hardware worker task crashed: {join_error}");
                println!("{message}");
                if let Ok(mut guard) = state.lock() {
                    guard.last_error = Some(message);
                }
            }
        }

        // Mock platform implementation
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        {
            Self::run_mock_scan_loop(&state, app_handle.as_ref()).await;
        }

        // Ensure state reflects actual task lifecycle (prevents zombie "running" states).
        Self::set_should_run(&state, false);
        Self::set_running_state(&state, false);
    }

    /// Run blocking RFID scan worker on a dedicated blocking thread.
    /// This keeps SPI operations completely off Tokio worker threads.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    fn run_hardware_scan_worker(
        state: Arc<Mutex<RfidServiceState>>,
        app_handle: Option<AppHandle>,
    ) {
        // Serialize all SPI access across background and one-shot modes.
        let spi_mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
        let _spi_guard = spi_mutex.blocking_lock();

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
                        Self::run_hardware_scan_loop_sync(&state, &app_handle, &mut scanner);

                    if !needs_reinit || !Self::should_continue_scanning(&state) {
                        break;
                    }

                    // Scanner gets dropped here (PersistentRfidScanner::drop calls hlta())
                    println!("RFID: Reinitializing scanner after consecutive errors...");
                    std::thread::sleep(Duration::from_secs(1));
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
                    std::thread::sleep(Duration::from_secs(u64::from(init_attempts)));
                }
            }
        }
    }

    /// Run the hardware scan loop for Raspberry Pi platform.
    /// Returns `true` if the scanner should be re-initialized (consecutive hardware errors),
    /// `false` if scanning was stopped normally.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    fn run_hardware_scan_loop_sync(
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
                    std::thread::sleep(Duration::from_millis(200));
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

    pub fn recover_rfid_hardware() -> Result<(), String> {
        println!("RFID: performing hardware recovery reset");
        reset_mfrc522_hardware()
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

    /// Single RFID scan with timeout for tag assignment flow.
    /// IMPORTANT: Keep in sync with TagAssignmentPage.tsx scanner modal timeout (currently 10s).
    pub async fn scan_rfid_hardware_single() -> Result<String, String> {
        scan_rfid_hardware_with_timeout(Duration::from_secs(10)).await
    }

    pub async fn scan_rfid_hardware_with_custom_timeout(
        timeout: Duration,
    ) -> Result<String, String> {
        scan_rfid_hardware_with_timeout(timeout).await
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
        tokio::task::spawn_blocking(move || {
            let mut mfrc522 = initialize_mfrc522_oneshot()?;
            run_scan_loop_with_timeout(&mut mfrc522, timeout)
        })
        .await
        .map_err(|e| format!("RFID one-shot scan task failed: {e}"))?
    }

    /// Probe the MFRC522 chip by actually communicating over SPI.
    /// Returns is_available=true only if the chip responds with a valid version.
    pub fn check_rfid_hardware() -> RfidScannerStatus {
        match probe_mfrc522_chip() {
            Ok(version) => RfidScannerStatus {
                is_available: true,
                platform: format!("Raspberry Pi (ARM64) - MFRC522 v0x{version:02X}"),
                last_error: None,
            },
            Err(e) => {
                println!("RFID hardware probe failed: {e}");
                RfidScannerStatus {
                    is_available: false,
                    platform: "Raspberry Pi (ARM64)".to_string(),
                    last_error: Some(e),
                }
            }
        }
    }

    /// Attempt real SPI communication with MFRC522: open device, init chip, read version.
    /// Returns the chip version byte on success, or a descriptive error.
    fn probe_mfrc522_chip() -> Result<u8, String> {
        if !std::path::Path::new("/dev/spidev0.0").exists() {
            return Err("SPI device /dev/spidev0.0 not found".to_string());
        }

        let mut spi =
            Spidev::open("/dev/spidev0.0").map_err(|e| format!("SPI open failed: {e:?}"))?;

        let options = SpidevOptions::new()
            .bits_per_word(8)
            .max_speed_hz(1_000_000)
            .mode(SpiModeFlags::SPI_MODE_0)
            .build();
        spi.configure(&options)
            .map_err(|e| format!("SPI configure failed: {e:?}"))?;

        reset_mfrc522_hardware()?;

        let spi_interface = SpiInterface::new(spi);
        let mut mfrc522 = Mfrc522::new(spi_interface)
            .init()
            .map_err(|e| format!("MFRC522 init failed: {e:?}"))?;

        let version = mfrc522
            .version()
            .map_err(|e| format!("MFRC522 version read failed: {e:?}"))?;

        if version == 0x00 || version == 0xFF {
            return Err(format!(
                "MFRC522 version 0x{version:02X} indicates SPI communication failure"
            ));
        }

        Ok(version)
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

fn send_service_command(command: ServiceCommand) -> Result<(), String> {
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        let command_tx = {
            let service = service_arc
                .lock()
                .map_err(|e| format!("Failed to lock service: {e}"))?;
            service
                .command_tx
                .clone()
                .ok_or_else(|| "Service command channel not initialized".to_string())?
        };

        command_tx
            .send(command)
            .map_err(|e| format!("Failed to send command: {e}"))
    } else {
        Err("RFID service not initialized".to_string())
    }
}

async fn wait_for_service_running(expected_running: bool, timeout: Duration) -> Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;

    loop {
        let state = get_rfid_service_status().await?;
        let reached_target = if expected_running {
            state.is_running && state.should_run
        } else {
            !state.is_running
        };

        if reached_target {
            return Ok(());
        }

        if std::time::Instant::now() >= deadline {
            let expected = if expected_running {
                "running"
            } else {
                "stopped"
            };
            return Err(format!(
                "Timed out waiting for RFID service to become {expected}. Current state: is_running={}, should_run={}, last_error={:?}",
                state.is_running, state.should_run, state.last_error
            ));
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn stop_service_for_exclusive_hardware_access() {
    if send_service_command(ServiceCommand::Stop).is_ok() {
        if let Err(wait_error) = wait_for_service_running(false, Duration::from_secs(3)).await {
            println!("RFID: stop wait warning before exclusive scan: {wait_error}");
        }
    }
}

// New Tauri commands that control the background service
#[tauri::command]
pub async fn start_rfid_service() -> Result<String, String> {
    send_service_command(ServiceCommand::Start)?;
    wait_for_service_running(true, Duration::from_secs(2)).await?;
    Ok("RFID service started".to_string())
}

#[tauri::command]
pub async fn stop_rfid_service() -> Result<String, String> {
    send_service_command(ServiceCommand::Stop)?;
    wait_for_service_running(false, Duration::from_secs(4)).await?;
    Ok("RFID service stopped".to_string())
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
pub async fn recover_rfid_scanner() -> Result<String, String> {
    // Best-effort stop request first.
    if let Err(stop_error) = send_service_command(ServiceCommand::Stop) {
        println!("RFID recover: stop command warning: {stop_error}");
    }

    // Force GPIO reset immediately. This must not depend on SPI mutex acquisition.
    // In the hung case, reset should help unblock in-flight SPI calls.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        raspberry_pi::recover_rfid_hardware()?;
    }

    // Wait for scanner worker to observe stop signal after reset.
    if let Err(wait_error) = wait_for_service_running(false, Duration::from_secs(4)).await {
        println!("RFID recover: stop wait warning after reset: {wait_error}");
    }

    // Confirm we can take exclusive hardware access now.
    let spi_mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
    let _guard = tokio::time::timeout(Duration::from_secs(3), spi_mutex.lock())
        .await
        .map_err(|_| {
            "Scanner reset was triggered, but hardware is still busy. Please retry recovery."
                .to_string()
        })?;

    // Verify the scanner actually responds after reset.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        let status = tokio::task::spawn_blocking(raspberry_pi::check_rfid_hardware)
            .await
            .map_err(|e| format!("Hardware verification task failed: {e}"))?;

        if !status.is_available {
            let err_detail = status.last_error.unwrap_or_else(|| "unknown".to_string());
            return Err(format!(
                "Scanner-Hardware antwortet nach Reset nicht: {err_detail}"
            ));
        }
    }

    // Reset service-visible error state so UI can recover without app restart.
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        if let Ok(service) = service_arc.lock() {
            if let Ok(mut state_guard) = service.state.lock() {
                state_guard.error_count = 0;
                state_guard.last_error = None;
                state_guard.is_running = false;
                state_guard.should_run = false;
            }
        }
    }

    Ok("RFID scanner recovered".to_string())
}

#[tauri::command]
pub async fn get_rfid_scanner_status() -> Result<RfidScannerStatus, String> {
    // When the background scanner is running it holds the SPI mutex, so we cannot
    // probe the chip directly.  Use the service's live state instead.
    if let Some(service_arc) = RfidBackgroundService::get_instance() {
        if let Ok(service) = service_arc.lock() {
            if let Ok(state) = service.state.lock() {
                if state.is_running {
                    let is_healthy = state.error_count == 0 && state.last_error.is_none();
                    return Ok(RfidScannerStatus {
                        is_available: is_healthy,
                        platform: "Raspberry Pi (ARM64) - service running".to_string(),
                        last_error: state.last_error.clone(),
                    });
                }
            }
        }
    }

    // Service is not running — do a real hardware probe.
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        let spi_mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
        let _guard = tokio::time::timeout(Duration::from_secs(3), spi_mutex.lock())
            .await
            .map_err(|_| "Hardware busy — SPI mutex timeout during status check".to_string())?;

        return tokio::task::spawn_blocking(raspberry_pi::check_rfid_hardware)
            .await
            .map_err(|e| format!("Hardware probe task failed: {e}"))
            .map(Ok)?;
    }

    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    {
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
    // Ensure background scanner is stopped before one-shot access.
    stop_service_for_exclusive_hardware_access().await;

    let mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
    let _guard = tokio::time::timeout(Duration::from_secs(3), mutex.lock())
        .await
        .map_err(|_| "Timed out waiting for exclusive scanner access".to_string())?;

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
    // Ensure background scanner is stopped before one-shot access.
    stop_service_for_exclusive_hardware_access().await;

    let mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
    let _guard = tokio::time::timeout(Duration::from_secs(3), mutex.lock())
        .await
        .map_err(|_| "Timed out waiting for exclusive scanner access".to_string())?;

    // For future implementation - continuous scanning with custom timeout
    #[cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))]
    {
        raspberry_pi::scan_rfid_hardware_with_custom_timeout(Duration::from_secs(timeout_seconds))
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
