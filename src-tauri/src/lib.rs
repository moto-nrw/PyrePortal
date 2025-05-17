// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod logging;
mod rfid;
mod config;
mod auth;
mod api;
mod cache;
mod rfid_logging;

use std::sync::Mutex;
use rfid::PlatformRfidReader;
use crate::rfid::interface::RfidReader;
use tauri::Emitter;

#[tauri::command]
async fn start_nfc_scan(
    reader: tauri::State<'_, Mutex<PlatformRfidReader>>, 
    app_handle: tauri::AppHandle
) -> Result<(), String> {
    let mut reader = reader.lock().unwrap();
    reader.set_app_handle(app_handle);
    reader.start_scan().map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_nfc_scan(
    reader: tauri::State<'_, Mutex<PlatformRfidReader>>
) -> Result<(), String> {
    let mut reader = reader.lock().unwrap();
    reader.stop_scan().map_err(|e| e.to_string())
}

#[tauri::command]
async fn is_nfc_scanning(
    reader: tauri::State<'_, Mutex<PlatformRfidReader>>
) -> Result<bool, String> {
    let reader = reader.lock().unwrap();
    Ok(reader.is_scanning())
}

#[tauri::command]
async fn scan_rfid_tag(
    tag_id: String,
    room_id: Option<i32>,
    activity_id: Option<i32>,
    app_handle: tauri::AppHandle
) -> Result<Option<api::UserInfo>, String> {
    // Create tag with current timestamp
    let tag = rfid::interface::RfidTag {
        id: tag_id.clone(),
        timestamp: chrono::Utc::now().timestamp(),
    };
    
    // Send to server
    let result = api::send_tag_to_server(tag, room_id, activity_id).await;
    
    // Log the scan
    match &result {
        Ok(Some(user)) => {
            rfid_logging::log_tag_scan(
                &tag_id, 
                Some(&user.name), 
                if user.is_checked_in { "checked_in" } else { "checked_out" }
            );
            // Emit event for UI
            let _ = app_handle.emit("rfid-user-processed", user);
        },
        Ok(None) => {
            rfid_logging::log_tag_scan(&tag_id, None, "unknown_tag");
        },
        Err(e) => {
            rfid_logging::log_tag_scan(&tag_id, None, &format!("error: {}", e));
            // Emit error for UI
            let _ = app_handle.emit("rfid-error", e);
        }
    }
    
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = config::AppConfig::load();
    
    // Set up logging
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pyreportal").join("logs");
        
    if let Err(e) = rfid_logging::init(&log_dir) {
        eprintln!("Failed to initialize logging: {}", e);
    }
    
    // Set up cache directory
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pyreportal");
        
    if let Err(e) = cache::set_cache_dir(cache_dir) {
        eprintln!("Failed to set cache directory: {}", e);
    }
    
    // Create RFID reader instance
    let rfid_reader = PlatformRfidReader::new();
    
    // Run the application
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Start background task for processing cached scans
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                api::start_cache_processor(app_handle).await;
            });
            
            Ok(())
        })
        .manage(Mutex::new(rfid_reader))
        .invoke_handler(tauri::generate_handler![
            logging::write_log,
            logging::get_log_files,
            logging::read_log_file,
            logging::clear_log_file,
            logging::cleanup_old_logs,
            auth::set_user_auth,
            auth::clear_user_auth,
            auth::is_authenticated,
            start_nfc_scan,
            stop_nfc_scan,
            is_nfc_scanning,
            scan_rfid_tag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
