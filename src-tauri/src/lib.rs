// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod logging;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            logging::write_log,
            logging::get_log_files,
            logging::read_log_file,
            logging::clear_log_file,
            logging::cleanup_old_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
