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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Read fullscreen setting from environment variable
    let fullscreen = env::var("TAURI_FULLSCREEN")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase()
        == "true";

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_api_config,
            greet,
            quit_app,
            logging::write_log,
            logging::get_log_files,
            logging::read_log_file,
            logging::clear_log_file,
            logging::cleanup_old_logs,
            rfid::initialize_rfid_service,
            rfid::start_rfid_service,
            rfid::stop_rfid_service,
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
