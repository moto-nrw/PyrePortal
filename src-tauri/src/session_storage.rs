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
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Ensure the directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("session-settings.json"))
}

#[tauri::command]
pub async fn save_session_settings(
    app_handle: AppHandle,
    settings: SessionSettings,
) -> Result<(), String> {
    let settings_path = get_session_settings_path(&app_handle)?;

    let json_data = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize session settings: {}", e))?;

    fs::write(&settings_path, json_data)
        .map_err(|e| format!("Failed to write session settings file: {}", e))?;

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
        .map_err(|e| format!("Failed to read session settings file: {}", e))?;

    let settings: SessionSettings = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse session settings: {}", e))?;

    Ok(Some(settings))
}

#[tauri::command]
pub async fn clear_last_session(app_handle: AppHandle) -> Result<(), String> {
    let settings_path = get_session_settings_path(&app_handle)?;

    // Load existing settings if available
    if settings_path.exists() {
        let json_data = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read session settings file: {}", e))?;

        let mut settings: SessionSettings = serde_json::from_str(&json_data)
            .map_err(|e| format!("Failed to parse session settings: {}", e))?;

        // Clear only the last session data, keep toggle state
        settings.last_session = None;
        settings.use_last_session = false; // Also turn off toggle when clearing

        // Save updated settings
        let json_data = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize session settings: {}", e))?;

        fs::write(&settings_path, json_data)
            .map_err(|e| format!("Failed to write session settings file: {}", e))?;
    }

    Ok(())
}
