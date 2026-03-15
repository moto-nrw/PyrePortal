use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// Log entry structure for serialization/deserialization
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
        Err(e) => return Err(format!("Failed to parse log entry: {e}")),
    };

    // Print frontend log to terminal (visible in `npm run tauri dev` and production binary)
    let data_suffix = log_entry
        .data
        .as_ref()
        .map(|d| format!(" {d}"))
        .unwrap_or_default();
    eprintln!(
        "[{}] [{}] [{}] {}{}",
        log_entry.timestamp, log_entry.level, log_entry.source, log_entry.message, data_suffix
    );

    let log_dir = get_log_directory(&app).map_err(|e| e.to_string())?;
    let log_file = get_log_file_path(&log_dir);

    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {e}"))?;
    }

    // Open log file for appending, create if it doesn't exist
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {e}"))?;

    // Format the log entry as a JSON line
    let log_line = format!("{}\n", serde_json::to_string(&log_entry).unwrap());

    // Write to file
    file.write_all(log_line.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {e}"))?;

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
fn get_log_file_path(log_dir: &std::path::Path) -> PathBuf {
    let now: DateTime<Utc> = Utc::now();
    let filename = format!("pyre-portal-{}.log", now.format("%Y-%m-%d"));
    log_dir.join(filename)
}

/// Command to retrieve log file list
#[tauri::command]
pub async fn get_log_files<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {e}")),
    };

    if !log_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&log_dir).map_err(|e| format!("Failed to read log directory: {e}"))?;

    let mut log_files = Vec::new();
    for entry in entries.flatten() {
        if let Some(file_name) = entry.file_name().to_str() {
            if std::path::Path::new(file_name)
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("log"))
            {
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
        Err(e) => return Err(format!("Failed to get log directory: {e}")),
    };

    let file_path = log_dir.join(file_name);

    // Security check: ensure the file is actually in the log directory
    if !file_path.starts_with(&log_dir) || file_path.extension().is_none_or(|ext| ext != "log") {
        return Err("Invalid log file path".to_string());
    }

    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read log file: {e}"))
}

/// Command to clear a specific log file
#[tauri::command]
pub async fn clear_log_file<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
) -> Result<(), String> {
    let log_dir = match get_log_directory(&app) {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get log directory: {e}")),
    };

    let file_path = log_dir.join(file_name);

    // Security check: ensure the file is actually in the log directory
    if !file_path.starts_with(&log_dir) || file_path.extension().is_none_or(|ext| ext != "log") {
        return Err("Invalid log file path".to_string());
    }

    // Truncate the file by opening it with create mode
    File::create(&file_path).map_err(|e| format!("Failed to clear log file: {e}"))?;

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
        Err(e) => return Err(format!("Failed to get log directory: {e}")),
    };

    if !log_dir.exists() {
        return Ok(0);
    }

    let now = Utc::now();
    let cutoff = now - chrono::Duration::days(i64::from(days_to_keep));
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    let cutoff_filename = format!("pyre-portal-{cutoff_str}.log");

    let entries =
        fs::read_dir(&log_dir).map_err(|e| format!("Failed to read log directory: {e}"))?;

    let mut deleted_count = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            if std::path::Path::new(file_name)
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("log"))
                && file_name < &cutoff_filename[..]
                && fs::remove_file(&path).is_ok()
            {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_entry_serialization_roundtrip() {
        let entry = LogEntry {
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            level: "INFO".to_string(),
            source: "TestComponent".to_string(),
            message: "Test message".to_string(),
            data: Some(serde_json::json!({"key": "value"})),
            session_id: "test-session".to_string(),
            user_id: Some("user-1".to_string()),
        };

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: LogEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.timestamp, "2024-01-01T00:00:00Z");
        assert_eq!(deserialized.level, "INFO");
        assert_eq!(deserialized.source, "TestComponent");
        assert_eq!(deserialized.message, "Test message");
        assert_eq!(deserialized.session_id, "test-session");
        assert_eq!(deserialized.user_id.as_deref(), Some("user-1"));
        assert!(deserialized.data.is_some());
    }

    #[test]
    fn log_entry_omits_none_fields() {
        let entry = LogEntry {
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            level: "ERROR".to_string(),
            source: "Test".to_string(),
            message: "Error occurred".to_string(),
            data: None,
            session_id: "sess".to_string(),
            user_id: None,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(!json.contains("data"));
        assert!(!json.contains("userId"));
    }

    #[test]
    fn log_entry_uses_camel_case_keys() {
        let entry = LogEntry {
            timestamp: "t".to_string(),
            level: "l".to_string(),
            source: "s".to_string(),
            message: "m".to_string(),
            data: None,
            session_id: "id".to_string(),
            user_id: Some("u".to_string()),
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("sessionId"));
        assert!(json.contains("userId"));
        // Should NOT contain snake_case
        assert!(!json.contains("session_id"));
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn log_file_path_contains_date() {
        let dir = std::path::Path::new("/tmp/test-logs");
        let path = get_log_file_path(dir);

        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(filename.starts_with("pyre-portal-"));
        assert!(
            std::path::Path::new(filename)
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("log"))
        );

        // Should contain today's date in YYYY-MM-DD format
        let today = Utc::now().format("%Y-%m-%d").to_string();
        assert!(filename.contains(&today));
    }

    #[test]
    fn log_file_path_is_within_directory() {
        let dir = std::path::Path::new("/var/logs/pyreportal");
        let path = get_log_file_path(dir);

        assert!(path.starts_with(dir));
    }

    #[test]
    fn log_entry_deserializes_from_frontend_json() {
        // Simulate JSON from the frontend logger (camelCase keys)
        let frontend_json = r#"{
            "timestamp": "2024-06-15T10:30:00.000Z",
            "level": "WARN",
            "source": "RFIDService",
            "message": "Scan timeout",
            "data": {"tagId": "04:D6:94:82:97:6A:80", "retries": 3},
            "sessionId": "abc123_def456",
            "userId": "staff-42"
        }"#;

        let entry: LogEntry = serde_json::from_str(frontend_json).unwrap();
        assert_eq!(entry.level, "WARN");
        assert_eq!(entry.source, "RFIDService");
        assert_eq!(entry.session_id, "abc123_def456");
        assert_eq!(entry.user_id.as_deref(), Some("staff-42"));
        assert!(entry.data.is_some());
    }
}
