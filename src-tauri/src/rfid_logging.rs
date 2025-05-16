use log::LevelFilter;
use chrono::Local;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Tag scan logging
struct TagScanLogger {
    file: Mutex<File>,
}

impl TagScanLogger {
    fn new(log_file: &Path) -> std::io::Result<Self> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)?;
            
        Ok(Self {
            file: Mutex::new(file),
        })
    }
    
    fn log_scan(&self, tag_id: &str, user_name: Option<&str>, status: &str) -> std::io::Result<()> {
        let mut file = self.file.lock().unwrap();
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
        
        let user_info = match user_name {
            Some(name) => format!("{}", name),
            None => "Unknown".to_string(),
        };
        
        writeln!(file, "{}, {}, {}, {}", timestamp, tag_id, user_info, status)?;
        
        Ok(())
    }
}

static TAG_LOGGER: Lazy<Mutex<Option<TagScanLogger>>> = Lazy::new(|| Mutex::new(None));

pub fn init(log_dir: &Path) -> std::io::Result<()> {
    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        std::fs::create_dir_all(log_dir)?;
    }
    
    // Set up tag scan log
    let tag_log_path = log_dir.join("rfid_scans.csv");
    if !tag_log_path.exists() {
        // Create file with header if it doesn't exist
        let mut file = File::create(&tag_log_path)?;
        writeln!(file, "timestamp, tag_id, user, status")?;
    }
    
    let tag_logger = TagScanLogger::new(&tag_log_path)?;
    *TAG_LOGGER.lock().unwrap() = Some(tag_logger);
    
    // Configure general logging
    let _log_path = log_dir.join("pyreportal.log");
    
    // Use env_logger for console output
    env_logger::Builder::new()
        .filter(None, LevelFilter::Info)
        .format(|buf, record| {
            writeln!(
                buf,
                "{} [{}] {}: {}",
                Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                record.target(),
                record.args()
            )
        })
        .init();
    
    Ok(())
}

pub fn log_tag_scan(tag_id: &str, user_name: Option<&str>, status: &str) {
    if let Some(logger) = &*TAG_LOGGER.lock().unwrap() {
        if let Err(e) = logger.log_scan(tag_id, user_name, status) {
            log::error!("Failed to log tag scan: {}", e);
        }
    }
}