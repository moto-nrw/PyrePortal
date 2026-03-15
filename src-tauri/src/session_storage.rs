use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

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
fn get_session_settings_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
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
pub async fn save_session_settings<R: Runtime>(
    app_handle: AppHandle<R>,
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
pub async fn load_session_settings<R: Runtime>(
    app_handle: AppHandle<R>,
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
pub async fn clear_last_session<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
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
    use tauri::Manager;

    fn mock_app_handle() -> tauri::AppHandle<tauri::test::MockRuntime> {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        let handle = app.handle().clone();
        if let Ok(dir) = handle.path().app_data_dir() {
            let _ = fs::remove_dir_all(&dir);
        }
        handle
    }

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

    // ====================================================================
    // Serde tests
    // ====================================================================

    #[test]
    fn session_settings_serialization_roundtrip() {
        let settings = sample_settings();
        let json = serde_json::to_string_pretty(&settings).unwrap();
        let d: SessionSettings = serde_json::from_str(&json).unwrap();
        assert!(d.use_last_session);
        assert!(d.auto_save_enabled);
        let session = d.last_session.unwrap();
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
        let d: SessionSettings =
            serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
        assert!(!d.use_last_session);
        assert!(d.last_session.is_none());
    }

    #[test]
    fn last_session_config_has_all_display_fields() {
        let session = sample_last_session();
        let json = serde_json::to_string(&session).unwrap();
        for field in &[
            "activity_id",
            "room_id",
            "supervisor_ids",
            "saved_at",
            "activity_name",
            "room_name",
            "supervisor_names",
        ] {
            assert!(json.contains(field), "Missing field: {field}");
        }
    }

    // ====================================================================
    // Path helper tests
    // ====================================================================

    #[test]
    fn get_session_settings_path_ends_with_json() {
        let handle = mock_app_handle();
        let path = get_session_settings_path(&handle).unwrap();
        assert!(path.ends_with("session-settings.json"));
    }

    #[test]
    fn get_session_settings_path_creates_parent_dir() {
        let handle = mock_app_handle();
        let path = get_session_settings_path(&handle).unwrap();
        assert!(path.parent().unwrap().exists());
    }

    // ====================================================================
    // Tauri command tests (using mock AppHandle)
    // ====================================================================

    #[tokio::test]
    async fn save_and_load_session_settings_roundtrip() {
        let handle = mock_app_handle();
        let settings = sample_settings();

        save_session_settings(handle.clone(), settings).await.unwrap();

        let loaded = load_session_settings(handle).await.unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert!(loaded.use_last_session);
        assert!(loaded.auto_save_enabled);
        assert_eq!(loaded.last_session.unwrap().activity_id, 42);
    }

    #[test]
    fn load_returns_none_when_file_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("session-settings.json");
        // File doesn't exist → load should return None
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn save_overwrites_existing_settings() {
        let handle = mock_app_handle();

        // Save initial
        save_session_settings(handle.clone(), sample_settings())
            .await
            .unwrap();

        // Save different settings
        let new_settings = SessionSettings {
            use_last_session: false,
            auto_save_enabled: false,
            last_session: None,
        };
        save_session_settings(handle.clone(), new_settings)
            .await
            .unwrap();

        let loaded = load_session_settings(handle).await.unwrap().unwrap();
        assert!(!loaded.use_last_session);
        assert!(!loaded.auto_save_enabled);
        assert!(loaded.last_session.is_none());
    }

    #[tokio::test]
    async fn clear_last_session_command_clears_session_data() {
        let handle = mock_app_handle();

        // Save settings with a session
        save_session_settings(handle.clone(), sample_settings())
            .await
            .unwrap();

        // Clear
        clear_last_session(handle.clone()).await.unwrap();

        // Verify
        let loaded = load_session_settings(handle).await.unwrap().unwrap();
        assert!(!loaded.use_last_session);
        assert!(loaded.last_session.is_none());
        assert!(loaded.auto_save_enabled); // Preserved
    }

    #[tokio::test]
    async fn clear_last_session_noop_when_no_file() {
        let handle = mock_app_handle();
        // Should not error when there's nothing to clear
        clear_last_session(handle).await.unwrap();
    }

    #[tokio::test]
    async fn clear_last_session_preserves_auto_save() {
        let handle = mock_app_handle();

        let settings = SessionSettings {
            use_last_session: true,
            auto_save_enabled: true,
            last_session: Some(sample_last_session()),
        };
        save_session_settings(handle.clone(), settings).await.unwrap();
        clear_last_session(handle.clone()).await.unwrap();

        let loaded = load_session_settings(handle).await.unwrap().unwrap();
        assert!(loaded.auto_save_enabled);
        assert!(!loaded.use_last_session);
    }
}
