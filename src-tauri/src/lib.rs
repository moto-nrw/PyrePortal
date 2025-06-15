// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod logging;
mod rfid;

use std::env;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();
    
    // Read fullscreen setting from environment variable
    let fullscreen = env::var("TAURI_FULLSCREEN")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase() == "true";
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
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
            rfid::scan_rfid_with_timeout
        ])
        .setup(move |app| {
            // Create the main window with dynamic fullscreen setting
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("pyreportal")
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
