use serde::{Serialize, Deserialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Cache directory management
static CACHE_DIR: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

pub fn set_cache_dir(dir: PathBuf) -> std::io::Result<()> {
    let mut cache_dir = CACHE_DIR.lock().unwrap();
    fs::create_dir_all(&dir)?;
    *cache_dir = Some(dir);
    Ok(())
}

fn get_cache_dir() -> PathBuf {
    let cache_dir = CACHE_DIR.lock().unwrap();
    match &*cache_dir {
        Some(dir) => dir.clone(),
        None => {
            let dir = dirs::cache_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("pyreportal");
            drop(cache_dir); // Release lock before calling set_cache_dir
            let _ = set_cache_dir(dir.clone());
            dir
        }
    }
}

// Pending scan record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingScan {
    pub tag_id: String,
    pub terminal_id: String,
    pub timestamp: i64,
    pub room_id: Option<i32>,
    pub activity_id: Option<i32>,
    pub staff_id: Option<i32>,
    pub attempts: u8,
    pub created_at: DateTime<Utc>,
}

impl PendingScan {
    pub fn new(
        tag_id: String,
        terminal_id: String,
        timestamp: i64,
        room_id: Option<i32>,
        activity_id: Option<i32>,
        staff_id: Option<i32>,
    ) -> Self {
        Self {
            tag_id,
            terminal_id,
            timestamp,
            room_id,
            activity_id,
            staff_id,
            attempts: 0,
            created_at: Utc::now(),
        }
    }
}

// Save a scan to offline cache
pub fn cache_scan(scan: PendingScan) -> std::io::Result<()> {
    let cache_dir = get_cache_dir();
    let file_path = cache_dir.join(format!("scan_{}_{}.json", 
        scan.tag_id, 
        scan.created_at.timestamp_millis()));
    
    let json = serde_json::to_string(&scan)?;
    let mut file = File::create(file_path)?;
    file.write_all(json.as_bytes())?;
    
    Ok(())
}

// Get all cached scans
pub fn get_cached_scans() -> std::io::Result<Vec<PendingScan>> {
    let cache_dir = get_cache_dir();
    let mut scans = Vec::new();
    
    if !cache_dir.exists() {
        return Ok(scans);
    }
    
    for entry in fs::read_dir(cache_dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
            match File::open(&path) {
                Ok(mut file) => {
                    let mut contents = String::new();
                    if file.read_to_string(&mut contents).is_ok() {
                        if let Ok(scan) = serde_json::from_str::<PendingScan>(&contents) {
                            scans.push(scan);
                        }
                    }
                }
                Err(_) => continue,
            }
        }
    }
    
    // Sort by creation time (oldest first)
    scans.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    
    Ok(scans)
}

// Remove a cached scan
pub fn remove_cached_scan(scan: &PendingScan) -> std::io::Result<()> {
    let cache_dir = get_cache_dir();
    let file_pattern = format!("scan_{}_{}.json", 
        scan.tag_id, 
        scan.created_at.timestamp_millis());
    
    for entry in fs::read_dir(cache_dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() && path.file_name()
            .and_then(|n| n.to_str())
            .map_or(false, |name| name == file_pattern) {
            fs::remove_file(path)?;
            break;
        }
    }
    
    Ok(())
}

// Update a cached scan (usually to increment attempts)
pub fn update_cached_scan(scan: &PendingScan) -> std::io::Result<()> {
    remove_cached_scan(scan)?;
    cache_scan(scan.clone())
}