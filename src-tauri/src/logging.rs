use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// Log entry structure for serialization/deserialization
#[derive(Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

/// Function to write a log entry to the log file
#[tauri::command]
pub async fn write_log<R: Runtime>(app: AppHandle<R>, entry: String) -> Result<(), String> {
    let log_entry = match serde_json::from_str::<LogEntry>(&entry) {
        Ok(entry) => entry,
        Err(e) => return Err(format!("Failed to parse log entry: {}", e)),
    };

    let log_dir = get_log_directory(&app).map_err(|e| e.to_string())?;
    let log_file = get_log_file_path(&log_dir).map_err(|e| e.to_string())?;

    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    // Open log file for appending, create if it doesn't exist
    let mut file = OpenOptions::new()
        .write(true)
        .append(true)
        .create(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // Format the log entry as a JSON line
    let log_line = format!("{}\n", serde_json::to_string(&log_entry).unwrap());

    // Write to file
    file.write_all(log_line.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

/// Get the path to the log directory
fn get_log_directory<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    Ok(app_dir.join("logs"))
}

/// Get the path to the current log file
fn get_log_file_path(log_dir: &PathBuf) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let now: DateTime<Utc> = Utc::now();
    let filename = format!("pyre-portal-{}.log", now.format("%Y-%m-%d"));
    Ok(log_dir.join(filename))
}

/// Command to retrieve log file list
#[tauri::command]
pub async fn get_log_files<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {}", e)),
    };

    if !log_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&log_dir).map_err(|e| format!("Failed to read log directory: {}", e))?;

    let mut log_files = Vec::new();
    for entry in entries.flatten() {
        if let Some(file_name) = entry.file_name().to_str() {
            if file_name.ends_with(".log") {
                log_files.push(file_name.to_string());
            }
        }
    }

    // Sort files by name (which includes date) in descending order
    log_files.sort_by(|a, b| b.cmp(a));
    Ok(log_files)
}

/// Command to read a specific log file
#[tauri::command]
pub async fn read_log_file<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
) -> Result<String, String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {}", e)),
    };

    let file_path = log_dir.join(file_name);

    // Security check: ensure the file is actually in the log directory
    if !file_path.starts_with(&log_dir) || !file_path.extension().is_some_and(|ext| ext == "log") {
        return Err("Invalid log file path".to_string());
    }

    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read log file: {}", e))
}

/// Command to clear a specific log file
#[tauri::command]
pub async fn clear_log_file<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
) -> Result<(), String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {}", e)),
    };

    let file_path = log_dir.join(file_name);

    // Security check: ensure the file is actually in the log directory
    if !file_path.starts_with(&log_dir) || !file_path.extension().is_some_and(|ext| ext == "log") {
        return Err("Invalid log file path".to_string());
    }

    // Truncate the file by opening it with create mode
    File::create(&file_path).map_err(|e| format!("Failed to clear log file: {}", e))?;

    Ok(())
}

/// Command to delete old log files
#[tauri::command]
pub async fn cleanup_old_logs<R: Runtime>(
    app: AppHandle<R>,
    days_to_keep: u32,
) -> Result<u32, String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {}", e)),
    };

    if !log_dir.exists() {
        return Ok(0);
    }

    let now = Utc::now();
    let cutoff = now - chrono::Duration::days(days_to_keep as i64);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    let cutoff_filename = format!("pyre-portal-{}.log", cutoff_str);

    let entries =
        fs::read_dir(&log_dir).map_err(|e| format!("Failed to read log directory: {}", e))?;

    let mut deleted_count = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            if file_name.ends_with(".log") && file_name.to_string() < cutoff_filename && fs::remove_file(&path).is_ok() {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}
