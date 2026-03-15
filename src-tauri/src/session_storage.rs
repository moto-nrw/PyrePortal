use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LastSessionConfig {
    pub activity_id: i32,
    pub room_id: i32,
    pub supervisor_ids: Vec<i32>,
    pub saved_at: String,
    // Display names (from server, may change)
    pub activity_name: String,
    pub room_name: String,
    pub supervisor_names: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionSettings {
    pub use_last_session: bool,  // Toggle state
    pub auto_save_enabled: bool, // Always true for now
    pub last_session: Option<LastSessionConfig>,
}

/// Get the path to the session settings file
fn get_session_settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    // Ensure the directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;

    Ok(app_data_dir.join("session-settings.json"))
}

#[tauri::command]
pub async fn save_session_settings(
    app_handle: AppHandle,
    settings: SessionSettings,
) -> Result<(), String> {
    let settings_path = get_session_settings_path(&app_handle)?;

    let json_data = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize session settings: {e}"))?;

    fs::write(&settings_path, json_data)
        .map_err(|e| format!("Failed to write session settings file: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn load_session_settings(
    app_handle: AppHandle,
) -> Result<Option<SessionSettings>, String> {
    let settings_path = get_session_settings_path(&app_handle)?;

    // Check if file exists
    if !settings_path.exists() {
        return Ok(None);
    }

    let json_data = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read session settings file: {e}"))?;

    let settings: SessionSettings = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse session settings: {e}"))?;

    Ok(Some(settings))
}

#[tauri::command]
pub async fn clear_last_session(app_handle: AppHandle) -> Result<(), String> {
    let settings_path = get_session_settings_path(&app_handle)?;

    // Load existing settings if available
    if settings_path.exists() {
        let json_data = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read session settings file: {e}"))?;

        let mut settings: SessionSettings = serde_json::from_str(&json_data)
            .map_err(|e| format!("Failed to parse session settings: {e}"))?;

        // Clear only the last session data, keep toggle state
        settings.last_session = None;
        settings.use_last_session = false; // Also turn off toggle when clearing

        // Save updated settings
        let json_data = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize session settings: {e}"))?;

        fs::write(&settings_path, json_data)
            .map_err(|e| format!("Failed to write session settings file: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_last_session() -> LastSessionConfig {
        LastSessionConfig {
            activity_id: 42,
            room_id: 7,
            supervisor_ids: vec![1, 2, 3],
            saved_at: "2024-06-15T10:30:00Z".to_string(),
            activity_name: "Fußball AG".to_string(),
            room_name: "Turnhalle".to_string(),
            supervisor_names: vec!["Herr Müller".to_string(), "Frau Schmidt".to_string()],
        }
    }

    fn sample_settings() -> SessionSettings {
        SessionSettings {
            use_last_session: true,
            auto_save_enabled: true,
            last_session: Some(sample_last_session()),
        }
    }

    #[test]
    fn session_settings_serialization_roundtrip() {
        let settings = sample_settings();
        let json = serde_json::to_string_pretty(&settings).unwrap();
        let deserialized: SessionSettings = serde_json::from_str(&json).unwrap();

        assert!(deserialized.use_last_session);
        assert!(deserialized.auto_save_enabled);
        let session = deserialized.last_session.unwrap();
        assert_eq!(session.activity_id, 42);
        assert_eq!(session.room_id, 7);
        assert_eq!(session.supervisor_ids, vec![1, 2, 3]);
        assert_eq!(session.activity_name, "Fußball AG");
        assert_eq!(session.room_name, "Turnhalle");
    }

    #[test]
    fn session_settings_without_last_session() {
        let settings = SessionSettings {
            use_last_session: false,
            auto_save_enabled: true,
            last_session: None,
        };

        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: SessionSettings = serde_json::from_str(&json).unwrap();

        assert!(!deserialized.use_last_session);
        assert!(deserialized.last_session.is_none());
    }

    #[test]
    fn session_settings_filesystem_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session-settings.json");

        let settings = sample_settings();
        let json = serde_json::to_string_pretty(&settings).unwrap();
        fs::write(&path, &json).unwrap();

        let loaded_json = fs::read_to_string(&path).unwrap();
        let loaded: SessionSettings = serde_json::from_str(&loaded_json).unwrap();

        assert!(loaded.use_last_session);
        assert_eq!(loaded.last_session.unwrap().activity_id, 42);
    }

    #[test]
    fn clear_last_session_preserves_structure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session-settings.json");

        // Save settings with a session
        let settings = sample_settings();
        let json = serde_json::to_string_pretty(&settings).unwrap();
        fs::write(&path, &json).unwrap();

        // Simulate clear_last_session logic (same as the command does)
        let loaded_json = fs::read_to_string(&path).unwrap();
        let mut loaded: SessionSettings = serde_json::from_str(&loaded_json).unwrap();
        loaded.last_session = None;
        loaded.use_last_session = false;
        let updated_json = serde_json::to_string_pretty(&loaded).unwrap();
        fs::write(&path, updated_json).unwrap();

        // Verify
        let final_json = fs::read_to_string(&path).unwrap();
        let final_settings: SessionSettings = serde_json::from_str(&final_json).unwrap();
        assert!(!final_settings.use_last_session);
        assert!(final_settings.last_session.is_none());
        assert!(final_settings.auto_save_enabled); // Should be preserved
    }

    #[test]
    fn last_session_config_has_all_display_fields() {
        let session = sample_last_session();
        let json = serde_json::to_string(&session).unwrap();

        // Verify all fields are present in serialized JSON
        assert!(json.contains("activity_id"));
        assert!(json.contains("room_id"));
        assert!(json.contains("supervisor_ids"));
        assert!(json.contains("saved_at"));
        assert!(json.contains("activity_name"));
        assert!(json.contains("room_name"));
        assert!(json.contains("supervisor_names"));
    }
}
