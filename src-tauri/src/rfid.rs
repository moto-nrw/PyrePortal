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

        let already_running = scan_task_handle.as_ref().is_some_and(|h| !h.is_finished());
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
                println!(
                    "RFID scan task did not stop within timeout, aborting outer async wrapper"
                );
                handle.abort();

                // Clean up the outer async handle (settles quickly after abort).
                if let Some(aborted_handle) = scan_task_handle.take() {
                    let _ = tokio::time::timeout(Duration::from_millis(500), aborted_handle).await;
                }

                // Aborting the outer task does NOT cancel the inner spawn_blocking
                // worker, which may still be running and holding SPI_ACCESS_MUTEX.
                // Probe the mutex to determine whether the worker has actually exited
                // before reporting a stopped state.
                let spi_mutex = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
                if let Ok(_guard) =
                    tokio::time::timeout(Duration::from_millis(500), spi_mutex.lock()).await
                {
                    // SPI mutex is free — blocking worker has exited.
                    println!("RFID: SPI mutex free after abort, worker has exited");
                    Self::set_running_state(state, false);
                } else {
                    // Blocking worker still holds SPI — keep is_running=true
                    // and wait for the worker to drain in a background task.
                    println!(
                        "RFID: blocking worker still holds SPI after abort, draining in background"
                    );
                    let state_for_drain = Arc::clone(state);
                    tokio::spawn(async move {
                        let spi = SPI_ACCESS_MUTEX.get_or_init(|| TokioMutex::new(()));
                        let drained = tokio::time::timeout(Duration::from_secs(10), spi.lock())
                            .await
                            .is_ok();

                        // Check whether a new scan session was started while we
                        // were waiting.  If should_run flipped back to true, the
                        // service was restarted and this drain must not touch state.
                        let restarted = state_for_drain
                            .lock()
                            .map(|g| g.should_run)
                            .unwrap_or(false);

                        if restarted {
                            println!("RFID: drain complete but service was restarted during wait, preserving state");
                            return;
                        }

                        if drained {
                            println!("RFID blocking worker drained after abort");
                            Self::set_running_state(&state_for_drain, false);
                        } else {
                            // Worker is still holding SPI after 10s — do NOT report
                            // stopped, as that would allow a new start to "succeed"
                            // while the old worker still owns the hardware lock.
                            println!(
                                "RFID blocking worker did not drain within 10s after abort, keeping running state"
                            );
                            if let Ok(mut guard) = state_for_drain.lock() {
                                guard.last_error = Some(
                                    "Scanner worker did not release hardware after abort; restart device".to_string()
                                );
                            }
                        }
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
    /// Frontend budget: modal 18s, invoke 20s (covers stop + mutex + this 10s scan).
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

/// Send a command to a given service instance (testable without global state).
fn send_command_to(
    service_arc: &Arc<Mutex<RfidBackgroundService>>,
    command: ServiceCommand,
) -> Result<(), String> {
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
}

fn send_service_command(command: ServiceCommand) -> Result<(), String> {
    let service_arc = RfidBackgroundService::get_instance()
        .ok_or_else(|| "RFID service not initialized".to_string())?;
    send_command_to(&service_arc, command)
}

/// Wait for the service state to match expected running state (testable with state Arc).
async fn wait_for_state(
    state: &Arc<Mutex<RfidServiceState>>,
    expected_running: bool,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;

    loop {
        let current = state
            .lock()
            .map(|guard| guard.clone())
            .map_err(|e| format!("Failed to lock state: {e}"))?;

        let reached_target = if expected_running {
            current.is_running && current.should_run
        } else {
            !current.is_running
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
                current.is_running, current.should_run, current.last_error
            ));
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn wait_for_service_running(expected_running: bool, timeout: Duration) -> Result<(), String> {
    let service_arc = RfidBackgroundService::get_instance()
        .ok_or_else(|| "RFID service not initialized".to_string())?;
    let state = {
        let service = service_arc
            .lock()
            .map_err(|e| format!("Failed to lock service: {e}"))?;
        Arc::clone(&service.state)
    };
    wait_for_state(&state, expected_running, timeout).await
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a fresh state Arc for testing
    fn test_state() -> Arc<Mutex<RfidServiceState>> {
        Arc::new(Mutex::new(RfidServiceState {
            is_running: false,
            last_scan: None,
            error_count: 0,
            last_error: None,
            should_run: false,
        }))
    }

    // ====================================================================
    // Struct serialization tests
    // ====================================================================

    #[test]
    fn rfid_scan_result_success_serialization() {
        let result = RfidScanResult {
            success: true,
            tag_id: Some("04:D6:94:82:97:6A:80".to_string()),
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        let d: RfidScanResult = serde_json::from_str(&json).unwrap();
        assert!(d.success);
        assert_eq!(d.tag_id.as_deref(), Some("04:D6:94:82:97:6A:80"));
        assert!(d.error.is_none());
    }

    #[test]
    fn rfid_scan_result_error_serialization() {
        let result = RfidScanResult {
            success: false,
            tag_id: None,
            error: Some("Scan timeout - no card detected".to_string()),
        };
        let d: RfidScanResult = serde_json::from_str(&serde_json::to_string(&result).unwrap()).unwrap();
        assert!(!d.success);
        assert!(d.tag_id.is_none());
        assert!(d.error.unwrap().contains("timeout"));
    }

    #[test]
    fn rfid_scanner_status_serialization() {
        let status = RfidScannerStatus {
            is_available: true,
            platform: "Dev".to_string(),
            last_error: None,
        };
        let d: RfidScannerStatus = serde_json::from_str(&serde_json::to_string(&status).unwrap()).unwrap();
        assert!(d.is_available);
        assert!(!d.platform.is_empty());
    }

    #[test]
    fn rfid_scanner_status_with_error() {
        let status = RfidScannerStatus {
            is_available: false,
            platform: "Pi".to_string(),
            last_error: Some("SPI fail".to_string()),
        };
        let d: RfidScannerStatus = serde_json::from_str(&serde_json::to_string(&status).unwrap()).unwrap();
        assert!(!d.is_available);
        assert_eq!(d.last_error.as_deref(), Some("SPI fail"));
    }

    #[test]
    fn rfid_scan_event_serialization() {
        let event = RfidScanEvent {
            tag_id: "04:A7:B3:C2:D1:E0:F5".to_string(),
            timestamp: 1_718_000_000,
            platform: "Development Platform".to_string(),
        };
        let d: RfidScanEvent = serde_json::from_str(&serde_json::to_string(&event).unwrap()).unwrap();
        assert_eq!(d.tag_id, "04:A7:B3:C2:D1:E0:F5");
        assert_eq!(d.timestamp, 1_718_000_000);
    }

    #[test]
    fn rfid_service_state_default_values() {
        let state = test_state();
        let guard = state.lock().unwrap();
        assert!(!guard.is_running);
        assert!(!guard.should_run);
        assert_eq!(guard.error_count, 0);
        assert!(guard.last_scan.is_none());
        assert!(guard.last_error.is_none());
    }

    #[test]
    fn rfid_service_state_should_run_not_serialized() {
        let state = RfidServiceState {
            is_running: true,
            last_scan: None,
            error_count: 0,
            last_error: None,
            should_run: true,
        };
        let json = serde_json::to_string(&state).unwrap();
        assert!(!json.contains("should_run"));
        let d: RfidServiceState = serde_json::from_str(&json).unwrap();
        assert!(!d.should_run);
    }

    #[test]
    fn rfid_service_state_clone_is_independent() {
        let state = RfidServiceState {
            is_running: true,
            last_scan: Some(RfidScanEvent {
                tag_id: "AA:BB".to_string(),
                timestamp: 42,
                platform: "test".to_string(),
            }),
            error_count: 3,
            last_error: Some("err".to_string()),
            should_run: true,
        };
        let mut cloned = state.clone();
        cloned.is_running = false;
        cloned.error_count = 99;
        // Original unchanged
        assert!(state.is_running);
        assert_eq!(state.error_count, 3);
    }

    // ====================================================================
    // Service constructor & get_state
    // ====================================================================

    #[test]
    fn rfid_background_service_new_creates_stopped_state() {
        let service = RfidBackgroundService::new();
        let state = service.state.lock().unwrap();
        assert!(!state.is_running);
        assert!(!state.should_run);
        assert_eq!(state.error_count, 0);
        assert!(service.command_tx.is_none());
        assert!(service.app_handle.is_none());
    }

    #[test]
    fn get_state_returns_clone_of_current_state() {
        let service = RfidBackgroundService::new();
        {
            let mut guard = service.state.lock().unwrap();
            guard.is_running = true;
            guard.error_count = 7;
            guard.last_error = Some("test-error".to_string());
        }
        let snapshot = service.get_state().unwrap();
        assert!(snapshot.is_running);
        assert_eq!(snapshot.error_count, 7);
        assert_eq!(snapshot.last_error.as_deref(), Some("test-error"));
    }

    #[test]
    fn get_platform_name_returns_nonempty_string() {
        let name = RfidBackgroundService::get_platform_name();
        assert!(!name.is_empty());
        #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
        assert!(name.contains("Development Platform"));
    }

    // ====================================================================
    // State helper functions
    // ====================================================================

    #[test]
    fn should_continue_scanning_checks_should_run() {
        let state = test_state();
        state.lock().unwrap().should_run = true;
        assert!(RfidBackgroundService::should_continue_scanning(&state));
        state.lock().unwrap().should_run = false;
        assert!(!RfidBackgroundService::should_continue_scanning(&state));
    }

    #[test]
    fn set_running_state_sets_is_running() {
        let state = test_state();
        RfidBackgroundService::set_running_state(&state, true);
        let guard = state.lock().unwrap();
        assert!(guard.is_running);
        assert!(guard.last_error.is_none()); // clears error when set to running
    }

    #[test]
    fn set_running_state_false_keeps_error() {
        let state = test_state();
        {
            let mut guard = state.lock().unwrap();
            guard.last_error = Some("some error".to_string());
        }
        RfidBackgroundService::set_running_state(&state, false);
        let guard = state.lock().unwrap();
        assert!(!guard.is_running);
        // last_error is only cleared when setting to true
        assert_eq!(guard.last_error.as_deref(), Some("some error"));
    }

    #[test]
    fn set_should_run_updates_flag() {
        let state = test_state();
        RfidBackgroundService::set_should_run(&state, true);
        assert!(state.lock().unwrap().should_run);
        RfidBackgroundService::set_should_run(&state, false);
        assert!(!state.lock().unwrap().should_run);
    }

    // ====================================================================
    // handle_successful_scan
    // ====================================================================

    #[test]
    fn handle_successful_scan_updates_state() {
        let state = test_state();
        {
            let mut guard = state.lock().unwrap();
            guard.error_count = 5;
            guard.last_error = Some("old error".to_string());
        }
        RfidBackgroundService::handle_successful_scan(&state, None, "04:D6:94:82:97:6A:80");
        let guard = state.lock().unwrap();
        assert_eq!(guard.error_count, 5); // NOT reset
        assert!(guard.last_error.is_none()); // cleared
        let scan = guard.last_scan.as_ref().unwrap();
        assert_eq!(scan.tag_id, "04:D6:94:82:97:6A:80");
        assert!(scan.timestamp > 0);
    }

    #[test]
    fn handle_successful_scan_sets_platform() {
        let state = test_state();
        RfidBackgroundService::handle_successful_scan(&state, None, "AA:BB");
        let scan = state.lock().unwrap().last_scan.clone().unwrap();
        assert!(!scan.platform.is_empty());
    }

    // ====================================================================
    // handle_scan_error
    // ====================================================================

    #[test]
    fn handle_scan_error_increments_counter() {
        let state = test_state();
        RfidBackgroundService::handle_scan_error(&state, "SPI communication failure");
        let guard = state.lock().unwrap();
        assert_eq!(guard.error_count, 1);
        assert_eq!(guard.last_error.as_deref(), Some("SPI communication failure"));
    }

    #[test]
    fn handle_scan_error_ignores_no_card() {
        let state = test_state();
        RfidBackgroundService::handle_scan_error(&state, "No card detected");
        assert_eq!(state.lock().unwrap().error_count, 0);
        assert!(state.lock().unwrap().last_error.is_none());
    }

    #[test]
    fn handle_scan_error_ignores_timeout() {
        let state = test_state();
        RfidBackgroundService::handle_scan_error(&state, "Scan timeout - no card detected");
        assert_eq!(state.lock().unwrap().error_count, 0);
    }

    #[test]
    fn handle_scan_error_ignores_no_card_case_insensitive() {
        let state = test_state();
        RfidBackgroundService::handle_scan_error(&state, "NO CARD");
        assert_eq!(state.lock().unwrap().error_count, 0);
    }

    #[test]
    fn handle_scan_error_counts_real_errors() {
        let state = test_state();
        RfidBackgroundService::handle_scan_error(&state, "SPI error 1");
        RfidBackgroundService::handle_scan_error(&state, "SPI error 2");
        RfidBackgroundService::handle_scan_error(&state, "SPI error 3");
        let guard = state.lock().unwrap();
        assert_eq!(guard.error_count, 3);
        assert_eq!(guard.last_error.as_deref(), Some("SPI error 3"));
    }

    // ====================================================================
    // Async service lifecycle tests (tokio runtime)
    // ====================================================================

    #[tokio::test]
    async fn reap_finished_scan_task_clears_completed_handle() {
        let state = test_state();
        state.lock().unwrap().is_running = true;

        // Create a task that finishes immediately
        let mut handle: Option<tokio::task::JoinHandle<()>> = Some(tokio::spawn(async {}));
        // Let it finish
        tokio::time::sleep(Duration::from_millis(10)).await;

        RfidBackgroundService::reap_finished_scan_task(&state, &mut handle).await;

        assert!(handle.is_none());
        assert!(!state.lock().unwrap().is_running);
        assert!(!state.lock().unwrap().should_run);
    }

    #[tokio::test]
    async fn reap_finished_scan_task_ignores_running_handle() {
        let state = test_state();
        state.lock().unwrap().is_running = true;

        // Create a task that takes a while
        let mut handle: Option<tokio::task::JoinHandle<()>> = Some(tokio::spawn(async {
            tokio::time::sleep(Duration::from_secs(60)).await;
        }));

        RfidBackgroundService::reap_finished_scan_task(&state, &mut handle).await;

        // Handle should still be there (task not finished)
        assert!(handle.is_some());
        assert!(state.lock().unwrap().is_running);

        // Cleanup
        handle.unwrap().abort();
    }

    #[tokio::test]
    async fn reap_finished_scan_task_noop_on_none() {
        let state = test_state();
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;
        RfidBackgroundService::reap_finished_scan_task(&state, &mut handle).await;
        assert!(handle.is_none());
    }

    #[tokio::test]
    async fn handle_start_command_spawns_scan_task() {
        let state = test_state();
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;

        RfidBackgroundService::handle_start_command(&state, None, &mut handle).await;

        assert!(handle.is_some());
        assert!(state.lock().unwrap().is_running);
        assert!(state.lock().unwrap().should_run);

        // Stop and cleanup
        state.lock().unwrap().should_run = false;
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Some(h) = handle {
            h.abort();
        }
    }

    #[tokio::test]
    async fn handle_start_command_ignores_if_already_running() {
        let state = test_state();

        // First start
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;
        RfidBackgroundService::handle_start_command(&state, None, &mut handle).await;
        let first_handle_ptr = handle.as_ref().map(|h| format!("{h:?}"));

        // Second start — should be ignored
        RfidBackgroundService::handle_start_command(&state, None, &mut handle).await;
        let second_handle_ptr = handle.as_ref().map(|h| format!("{h:?}"));

        // Same handle (not replaced)
        assert_eq!(first_handle_ptr, second_handle_ptr);

        // Cleanup
        state.lock().unwrap().should_run = false;
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Some(h) = handle {
            h.abort();
        }
    }

    #[tokio::test]
    async fn handle_stop_command_stops_scan_task() {
        let state = test_state();

        // Start first
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;
        RfidBackgroundService::handle_start_command(&state, None, &mut handle).await;
        assert!(handle.is_some());

        // Stop
        RfidBackgroundService::handle_stop_command(&state, &mut handle).await;

        assert!(handle.is_none());
        assert!(!state.lock().unwrap().is_running);
    }

    #[tokio::test]
    async fn handle_stop_command_noop_when_no_handle() {
        let state = test_state();
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;

        RfidBackgroundService::handle_stop_command(&state, &mut handle).await;

        assert!(handle.is_none());
        assert!(!state.lock().unwrap().is_running);
    }

    #[tokio::test]
    async fn handle_stop_command_with_still_running_state_no_handle() {
        let state = test_state();
        state.lock().unwrap().is_running = true;
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;

        RfidBackgroundService::handle_stop_command(&state, &mut handle).await;
        // is_running stays true when no handle but state says running (draining)
        assert!(state.lock().unwrap().is_running);
    }

    #[tokio::test]
    async fn background_scanning_loop_processes_start_and_stop() {
        let state = test_state();
        let (tx, mut rx) = mpsc::unbounded_channel::<ServiceCommand>();

        let loop_state = Arc::clone(&state);
        let loop_handle = tokio::spawn(async move {
            RfidBackgroundService::background_scanning_loop(loop_state, None, &mut rx).await;
        });

        // Send Start
        tx.send(ServiceCommand::Start).unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(state.lock().unwrap().is_running);

        // Send Stop
        tx.send(ServiceCommand::Stop).unwrap();
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Drop sender to exit the loop
        drop(tx);
        let _ = tokio::time::timeout(Duration::from_secs(2), loop_handle).await;

        assert!(!state.lock().unwrap().is_running);
    }

    #[tokio::test]
    async fn background_scanning_loop_exits_on_channel_close() {
        let state = test_state();
        let (tx, mut rx) = mpsc::unbounded_channel::<ServiceCommand>();

        let loop_state = Arc::clone(&state);
        let loop_handle = tokio::spawn(async move {
            RfidBackgroundService::background_scanning_loop(loop_state, None, &mut rx).await;
        });

        // Close immediately
        drop(tx);
        let result = tokio::time::timeout(Duration::from_secs(2), loop_handle).await;
        assert!(result.is_ok(), "Loop should exit when channel closes");
    }

    #[tokio::test]
    async fn continuous_scan_loop_exits_when_should_run_false() {
        let state = test_state();
        // should_run starts as false → loop should exit immediately
        let loop_state = Arc::clone(&state);
        let handle = tokio::spawn(async move {
            RfidBackgroundService::continuous_scan_loop(loop_state, None).await;
        });

        let result = tokio::time::timeout(Duration::from_secs(2), handle).await;
        assert!(result.is_ok(), "Loop should exit immediately when should_run=false");
    }

    #[tokio::test]
    async fn continuous_scan_loop_scans_then_stops() {
        let state = test_state();
        state.lock().unwrap().should_run = true;

        let loop_state = Arc::clone(&state);
        let handle = tokio::spawn(async move {
            RfidBackgroundService::continuous_scan_loop(loop_state, None).await;
        });

        // Let it scan for a bit
        tokio::time::sleep(Duration::from_millis(500)).await;

        // It should have scanned at least once
        let had_scan = state.lock().unwrap().last_scan.is_some();

        // Signal stop
        state.lock().unwrap().should_run = false;
        let result = tokio::time::timeout(Duration::from_secs(3), handle).await;
        assert!(result.is_ok(), "Loop should exit after should_run=false");
        assert!(!state.lock().unwrap().should_run);
        assert!(!state.lock().unwrap().is_running);
        // On mock platform we should have gotten at least one scan
        assert!(had_scan, "Should have scanned at least once");
    }

    // ====================================================================
    // Mock platform tests (only on non-ARM)
    // ====================================================================

    #[cfg(not(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux")))]
    mod mock_tests {
        use super::*;

        #[test]
        fn mock_check_hardware_is_always_available() {
            let status = mock_platform::check_rfid_hardware();
            assert!(status.is_available);
            assert!(status.platform.contains("MOCK"));
            assert!(status.last_error.is_none());
        }

        #[tokio::test]
        async fn mock_scan_returns_valid_tag_format() {
            let mut got_success = false;
            for _ in 0..50 {
                if let Ok(tag) = mock_platform::scan_rfid_hardware().await {
                    assert!(tag.contains(':'), "Tag should contain colons: {tag}");
                    let parts: Vec<&str> = tag.split(':').collect();
                    assert_eq!(parts.len(), 7, "Tag should have 7 hex bytes: {tag}");
                    assert!(tag.starts_with("04:"), "Tag should start with 04: {tag}");
                    got_success = true;
                    break;
                }
            }
            assert!(got_success);
        }

        #[tokio::test]
        async fn mock_single_scan_returns_valid_tag() {
            let result = mock_platform::scan_rfid_hardware_single().await;
            // May error (5% rate) but if Ok, should be valid format
            if let Ok(tag) = result {
                assert!(tag.starts_with("04:"));
            }
        }

        #[tokio::test]
        async fn mock_scan_can_produce_errors() {
            // With 5% error rate, 200 attempts should produce at least one error
            let mut got_error = false;
            for _ in 0..200 {
                if mock_platform::scan_rfid_hardware().await.is_err() {
                    got_error = true;
                    break;
                }
            }
            assert!(got_error, "Mock should produce errors occasionally");
        }

        #[tokio::test]
        async fn perform_platform_scan_delegates_to_mock() {
            // Just verify it doesn't panic and returns a Result
            let result = RfidBackgroundService::perform_platform_scan().await;
            assert!(result.is_ok() || result.is_err());
        }

        #[tokio::test]
        async fn run_mock_scan_loop_exits_when_not_running() {
            let state = test_state();
            // should_run is false → exits immediately
            RfidBackgroundService::run_mock_scan_loop(&state, None).await;
            assert!(!state.lock().unwrap().is_running);
        }

        #[tokio::test]
        async fn run_mock_scan_loop_scans_until_stopped() {
            let state = test_state();
            state.lock().unwrap().should_run = true;

            let loop_state = Arc::clone(&state);
            let handle = tokio::spawn(async move {
                RfidBackgroundService::run_mock_scan_loop(&loop_state, None).await;
            });

            // Let mock scanning run briefly
            tokio::time::sleep(Duration::from_millis(800)).await;
            state.lock().unwrap().should_run = false;

            let result = tokio::time::timeout(Duration::from_secs(2), handle).await;
            assert!(result.is_ok());
        }
    }

    // ====================================================================
    // handle_stop_command: abort path (task doesn't stop in time)
    // ====================================================================

    #[tokio::test]
    async fn handle_stop_command_aborts_stuck_task() {
        let state = test_state();
        state.lock().unwrap().is_running = true;

        // Create a task that ignores cancellation (blocks forever)
        let mut handle: Option<tokio::task::JoinHandle<()>> = Some(tokio::spawn(async {
            // This task won't check should_run, simulating a stuck scanner
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        }));

        // handle_stop_command will timeout after STOP_JOIN_TIMEOUT (3s), then abort
        RfidBackgroundService::handle_stop_command(&state, &mut handle).await;

        // After abort, handle should be cleared
        assert!(handle.is_none());
        // SPI mutex is free (no real SPI in test), so state should be stopped
        assert!(!state.lock().unwrap().is_running);
    }

    #[tokio::test]
    async fn handle_stop_command_handles_panicked_task() {
        let state = test_state();
        state.lock().unwrap().is_running = true;

        // Create a task that panics
        let mut handle: Option<tokio::task::JoinHandle<()>> = Some(tokio::spawn(async {
            panic!("simulated RFID scanner panic");
        }));

        // Wait for the panic to propagate
        tokio::time::sleep(Duration::from_millis(50)).await;

        RfidBackgroundService::handle_stop_command(&state, &mut handle).await;

        assert!(handle.is_none());
        assert!(!state.lock().unwrap().is_running);
    }

    // ====================================================================
    // handle_start_command: deferred start when stop in progress
    // ====================================================================

    #[tokio::test]
    async fn handle_start_command_deferred_when_stopping() {
        let state = test_state();
        {
            let mut guard = state.lock().unwrap();
            guard.is_running = true;
            guard.should_run = false; // stop in progress
        }

        // No actual handle, but state says running with should_run=false
        let mut handle: Option<tokio::task::JoinHandle<()>> = None;
        RfidBackgroundService::handle_start_command(&state, None, &mut handle).await;

        // Should NOT spawn a new task (stop still in progress)
        assert!(handle.is_none());
    }

    // ====================================================================
    // reap_finished_scan_task: panicked task
    // ====================================================================

    #[tokio::test]
    async fn reap_finished_scan_task_handles_panicked_task() {
        let state = test_state();
        state.lock().unwrap().is_running = true;

        let mut handle: Option<tokio::task::JoinHandle<()>> = Some(tokio::spawn(async {
            panic!("scanner crash");
        }));
        tokio::time::sleep(Duration::from_millis(50)).await;

        RfidBackgroundService::reap_finished_scan_task(&state, &mut handle).await;

        assert!(handle.is_none());
        assert!(!state.lock().unwrap().is_running);
    }

    // ====================================================================
    // set_running_state: clears error when set to true
    // ====================================================================

    #[test]
    fn set_running_state_clears_error_on_start() {
        let state = test_state();
        {
            let mut guard = state.lock().unwrap();
            guard.last_error = Some("old error".to_string());
        }
        RfidBackgroundService::set_running_state(&state, true);
        assert!(state.lock().unwrap().last_error.is_none());
    }

    // ====================================================================
    // send_command_to (testable without global RFID_SERVICE)
    // ====================================================================

    #[test]
    fn send_command_to_fails_without_channel() {
        let service = RfidBackgroundService::new();
        let service_arc = Arc::new(Mutex::new(service));

        let result = send_command_to(&service_arc, ServiceCommand::Start);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not initialized"));
    }

    #[test]
    fn send_command_to_succeeds_with_channel() {
        let mut service = RfidBackgroundService::new();
        let (tx, _rx) = mpsc::unbounded_channel::<ServiceCommand>();
        service.command_tx = Some(tx);
        let service_arc = Arc::new(Mutex::new(service));

        let result = send_command_to(&service_arc, ServiceCommand::Start);
        assert!(result.is_ok());
    }

    #[test]
    fn send_command_to_fails_when_receiver_dropped() {
        let mut service = RfidBackgroundService::new();
        let (tx, rx) = mpsc::unbounded_channel::<ServiceCommand>();
        service.command_tx = Some(tx);
        drop(rx); // Drop receiver

        let service_arc = Arc::new(Mutex::new(service));
        let result = send_command_to(&service_arc, ServiceCommand::Stop);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to send"));
    }

    #[test]
    fn send_service_command_fails_when_not_initialized() {
        if RfidBackgroundService::get_instance().is_none() {
            let result = send_service_command(ServiceCommand::Start);
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("not initialized"));
        }
    }

    // ====================================================================
    // wait_for_state (testable without global RFID_SERVICE)
    // ====================================================================

    #[tokio::test]
    async fn wait_for_state_returns_immediately_when_already_target() {
        let state = test_state();
        // Already stopped → wait_for_state(false) should return immediately
        let result = wait_for_state(&state, false, Duration::from_millis(100)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn wait_for_state_returns_when_running() {
        let state = test_state();
        {
            let mut guard = state.lock().unwrap();
            guard.is_running = true;
            guard.should_run = true;
        }
        let result = wait_for_state(&state, true, Duration::from_millis(100)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn wait_for_state_times_out() {
        let state = test_state();
        // State is stopped, wait for running → should timeout
        let result = wait_for_state(&state, true, Duration::from_millis(100)).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Timed out"));
        assert!(err.contains("running"));
    }

    #[tokio::test]
    async fn wait_for_state_timeout_for_stop() {
        let state = test_state();
        state.lock().unwrap().is_running = true;
        // State is running, wait for stop → should timeout
        let result = wait_for_state(&state, false, Duration::from_millis(100)).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("stopped"));
    }

    #[tokio::test]
    async fn wait_for_state_detects_transition() {
        let state = test_state();
        let state_clone = Arc::clone(&state);

        // Spawn a task that sets running after a delay
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let mut guard = state_clone.lock().unwrap();
            guard.is_running = true;
            guard.should_run = true;
        });

        let result = wait_for_state(&state, true, Duration::from_secs(1)).await;
        assert!(result.is_ok());
    }

    // ====================================================================
    // STOP_JOIN_TIMEOUT constant
    // ====================================================================

    #[test]
    fn stop_join_timeout_is_reasonable() {
        assert_eq!(RfidBackgroundService::STOP_JOIN_TIMEOUT, Duration::from_secs(3));
    }

    // ====================================================================
    // ServiceCommand enum
    // ====================================================================

    #[test]
    fn service_command_debug_format() {
        let start = ServiceCommand::Start;
        let stop = ServiceCommand::Stop;
        assert_eq!(format!("{start:?}"), "Start");
        assert_eq!(format!("{stop:?}"), "Stop");
    }
}
