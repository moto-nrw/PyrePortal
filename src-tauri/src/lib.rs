// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod logging;
mod rfid;
mod session_storage;

use serde::{Deserialize, Serialize};
use std::env;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Serialize, Deserialize)]
struct ApiConfig {
    api_base_url: String,
    device_api_key: String,
}

#[tauri::command]
fn get_api_config() -> Result<ApiConfig, String> {
    // Try to read from runtime env first, fallback to VITE_ prefixed for compatibility
    let api_base_url = env::var("API_BASE_URL")
        .or_else(|_| env::var("VITE_API_BASE_URL"))
        .unwrap_or_else(|_| "http://localhost:8080".to_string());

    let device_api_key = env::var("DEVICE_API_KEY")
        .or_else(|_| env::var("VITE_DEVICE_API_KEY"))
        .map_err(|_| "API key not found. Please set DEVICE_API_KEY or VITE_DEVICE_API_KEY environment variable")?;

    Ok(ApiConfig {
        api_base_url,
        device_api_key,
    })
}

/// Parse the fullscreen env var into a boolean. Extracted for testability.
fn parse_fullscreen_env() -> bool {
    env::var("TAURI_FULLSCREEN")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase()
        == "true"
}

#[tauri::command]
fn restart_app() {
    // Exit with code 0 - Balena's restart: always policy will restart the container
    // On macOS/dev mode, the app simply exits
    std::process::exit(0);
}

/// Initializes and runs the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri application fails to start (e.g., window creation fails).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Read fullscreen setting from environment variable
    let fullscreen = parse_fullscreen_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_api_config,
            restart_app,
            logging::write_log,
            logging::get_log_files,
            logging::read_log_file,
            logging::clear_log_file,
            logging::cleanup_old_logs,
            rfid::initialize_rfid_service,
            rfid::start_rfid_service,
            rfid::stop_rfid_service,
            rfid::recover_rfid_scanner,
            rfid::get_rfid_service_status,
            rfid::get_rfid_scanner_status,
            rfid::scan_rfid_single,
            rfid::scan_rfid_with_timeout,
            session_storage::save_session_settings,
            session_storage::load_session_settings,
            session_storage::clear_last_session
        ])
        .setup(move |app| {
            // Create the main window with dynamic fullscreen setting
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("pyreportal")
                .inner_size(1280.0, 720.0)
                .resizable(true)
                .fullscreen(fullscreen)
                .center()
                .decorations(!fullscreen) // No decorations in fullscreen, decorations in windowed mode
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_config_serialization_roundtrip() {
        let config = ApiConfig {
            api_base_url: "http://localhost:8080".to_string(),
            device_api_key: "test-key-123".to_string(),
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ApiConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.api_base_url, "http://localhost:8080");
        assert_eq!(deserialized.device_api_key, "test-key-123");
    }

    #[test]
    fn get_api_config_uses_env_vars() {
        // Set the primary env vars
        env::set_var("API_BASE_URL", "http://test-server:9090");
        env::set_var("DEVICE_API_KEY", "test-device-key");

        let config = get_api_config().unwrap();
        assert_eq!(config.api_base_url, "http://test-server:9090");
        assert_eq!(config.device_api_key, "test-device-key");

        env::remove_var("API_BASE_URL");
        env::remove_var("DEVICE_API_KEY");
    }

    #[test]
    fn get_api_config_falls_back_to_vite_prefix() {
        env::remove_var("API_BASE_URL");
        env::remove_var("DEVICE_API_KEY");
        env::set_var("VITE_API_BASE_URL", "http://vite-server:3000");
        env::set_var("VITE_DEVICE_API_KEY", "vite-key");

        let config = get_api_config().unwrap();
        assert_eq!(config.api_base_url, "http://vite-server:3000");
        assert_eq!(config.device_api_key, "vite-key");

        env::remove_var("VITE_API_BASE_URL");
        env::remove_var("VITE_DEVICE_API_KEY");
    }

    #[test]
    fn get_api_config_defaults_base_url_when_missing() {
        env::remove_var("API_BASE_URL");
        env::remove_var("VITE_API_BASE_URL");
        env::set_var("DEVICE_API_KEY", "some-key");

        let config = get_api_config().unwrap();
        assert_eq!(config.api_base_url, "http://localhost:8080");

        env::remove_var("DEVICE_API_KEY");
    }

    #[test]
    fn get_api_config_errors_when_no_api_key() {
        env::remove_var("DEVICE_API_KEY");
        env::remove_var("VITE_DEVICE_API_KEY");

        let result = get_api_config();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("API key not found"));
    }

    #[test]
    fn parse_fullscreen_defaults_to_true() {
        env::remove_var("TAURI_FULLSCREEN");
        assert!(parse_fullscreen_env());
    }

    #[test]
    fn parse_fullscreen_respects_false() {
        env::set_var("TAURI_FULLSCREEN", "false");
        assert!(!parse_fullscreen_env());
        env::remove_var("TAURI_FULLSCREEN");
    }

    #[test]
    fn parse_fullscreen_case_insensitive() {
        env::set_var("TAURI_FULLSCREEN", "TRUE");
        assert!(parse_fullscreen_env());

        env::set_var("TAURI_FULLSCREEN", "False");
        assert!(!parse_fullscreen_env());

        env::remove_var("TAURI_FULLSCREEN");
    }
}
