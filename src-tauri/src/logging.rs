use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
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

/// Parse and write a log entry to the given log directory.
fn write_log_to_dir(log_dir: &std::path::Path, entry: &str) -> Result<(), String> {
    let log_entry = serde_json::from_str::<LogEntry>(entry)
        .map_err(|e| format!("Failed to parse log entry: {e}"))?;

    // Print frontend log to terminal (visible in `pnpm run tauri dev` and production binary)
    let data_suffix = log_entry
        .data
        .as_ref()
        .map(|d| format!(" {d}"))
        .unwrap_or_default();
    eprintln!(
        "[{}] [{}] [{}] {}{}",
        log_entry.timestamp, log_entry.level, log_entry.source, log_entry.message, data_suffix
    );

    let log_file = get_log_file_path(log_dir);

    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        fs::create_dir_all(log_dir).map_err(|e| format!("Failed to create log directory: {e}"))?;
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

/// Function to write a log entry to the log file
#[tauri::command]
pub async fn write_log<R: Runtime>(app: AppHandle<R>, entry: String) -> Result<(), String> {
    let log_dir = get_log_directory(&app).map_err(|e| e.to_string())?;
    write_log_to_dir(&log_dir, &entry)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry() -> LogEntry {
        LogEntry {
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            level: "INFO".to_string(),
            source: "Test".to_string(),
            message: "hello".to_string(),
            data: None,
            session_id: "s1".to_string(),
            user_id: None,
        }
    }

    fn sample_entry_json() -> String {
        serde_json::to_string(&sample_entry()).unwrap()
    }

    fn sample_entry_json_with_data() -> String {
        serde_json::to_string(&LogEntry {
            timestamp: "2024-06-15T10:30:00Z".to_string(),
            level: "WARN".to_string(),
            source: "RFID".to_string(),
            message: "Scan timeout".to_string(),
            data: Some(serde_json::json!({"retries": 3})),
            session_id: "abc".to_string(),
            user_id: Some("staff-42".to_string()),
        })
        .unwrap()
    }

    // ====================================================================
    // Serde tests
    // ====================================================================

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
        let d: LogEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(d.timestamp, "2024-01-01T00:00:00Z");
        assert_eq!(d.level, "INFO");
        assert_eq!(d.source, "TestComponent");
        assert_eq!(d.message, "Test message");
        assert_eq!(d.session_id, "test-session");
        assert_eq!(d.user_id.as_deref(), Some("user-1"));
        assert!(d.data.is_some());
    }

    #[test]
    fn log_entry_omits_none_fields() {
        let entry = LogEntry {
            timestamp: "t".to_string(),
            level: "l".to_string(),
            source: "s".to_string(),
            message: "m".to_string(),
            data: None,
            session_id: "id".to_string(),
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
        assert!(!json.contains("session_id"));
        assert!(!json.contains("user_id"));
    }

    #[test]
    fn log_entry_deserializes_from_frontend_json() {
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
        assert_eq!(entry.session_id, "abc123_def456");
        assert_eq!(entry.user_id.as_deref(), Some("staff-42"));
        assert!(entry.data.is_some());
    }

    // ====================================================================
    // Pure function tests
    // ====================================================================

    #[test]
    fn log_file_path_contains_date() {
        let dir = std::path::Path::new("/tmp/test-logs");
        let path = get_log_file_path(dir);
        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(filename.starts_with("pyre-portal-"));
        assert!(std::path::Path::new(filename)
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("log")));
        let today = Utc::now().format("%Y-%m-%d").to_string();
        assert!(filename.contains(&today));
    }

    #[test]
    fn log_file_path_is_within_directory() {
        let dir = std::path::Path::new("/var/logs/pyreportal");
        let path = get_log_file_path(dir);
        assert!(path.starts_with(dir));
    }

    // ====================================================================
    // Extracted helper function tests (using tempdir, no AppHandle)
    // ====================================================================

    #[test]
    fn write_log_to_dir_creates_and_appends() {
        let tmp = tempfile::tempdir().unwrap();
        let log_dir = tmp.path().join("logs");

        write_log_to_dir(&log_dir, &sample_entry_json()).unwrap();
        write_log_to_dir(&log_dir, &sample_entry_json()).unwrap();

        let log_file = get_log_file_path(&log_dir);
        assert!(log_file.exists());
        let content = fs::read_to_string(log_file).unwrap();
        let lines: Vec<&str> = content.trim().lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(content.contains("hello"));
    }

    #[test]
    fn write_log_to_dir_with_data() {
        let tmp = tempfile::tempdir().unwrap();
        let log_dir = tmp.path().join("logs");
        write_log_to_dir(&log_dir, &sample_entry_json_with_data()).unwrap();

        let content = fs::read_to_string(get_log_file_path(&log_dir)).unwrap();
        assert!(content.contains("retries"));
        assert!(content.contains("staff-42"));
    }

    #[test]
    fn write_log_to_dir_rejects_invalid_json() {
        let tmp = tempfile::tempdir().unwrap();
        let result = write_log_to_dir(tmp.path(), "not valid json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to parse"));
    }

    // ====================================================================
    // Tauri mock-app integration tests
    // ====================================================================

    #[test]
    fn get_log_directory_via_mock_app_returns_logs_subdir() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let dir = get_log_directory(app.handle()).unwrap();
        assert!(dir.ends_with("logs"));
    }

    #[tokio::test]
    async fn write_log_via_tauri_command_works() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        write_log(handle.clone(), sample_entry_json())
            .await
            .unwrap();

        let log_dir = get_log_directory(&handle).unwrap();
        let content = fs::read_to_string(get_log_file_path(&log_dir)).unwrap();
        assert!(content.contains("hello"));
    }

    #[tokio::test]
    async fn write_log_rejects_bad_json_via_command() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let result = write_log(app.handle().clone(), "{{bad".to_string()).await;
        assert!(result.is_err());
    }
}
