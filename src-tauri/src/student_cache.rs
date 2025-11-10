use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedStudent {
    pub id: i32,
    pub name: String,
    pub status: String, // "checked_in" | "checked_out"
    #[serde(rename = "lastSeen")]
    pub last_seen: String, // ISO timestamp
    pub room: Option<String>,
    pub activity: Option<String>,
    #[serde(rename = "cachedAt")]
    pub cached_at: String, // ISO timestamp when cached
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CacheMetadata {
    #[serde(rename = "lastSync")]
    pub last_sync: String,
    pub version: i32,
    #[serde(rename = "dateCreated")]
    pub date_created: String, // YYYY-MM-DD format
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentCacheData {
    pub students: HashMap<String, CachedStudent>, // rfidTag -> CachedStudent
    pub metadata: CacheMetadata,
}

/// Get today's date string for cache file naming (YYYY-MM-DD)
fn get_today_date_key() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

/// Generate cache filename for today
fn get_cache_filename() -> String {
    format!("student_cache_{}.json", get_today_date_key())
}

/// Get the path to the student cache file
fn get_student_cache_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Ensure the directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join(get_cache_filename()))
}

/// Validate cache data structure and check if it's for today
fn is_cache_valid(cache: &StudentCacheData) -> bool {
    // Check if cache is for today
    cache.metadata.date_created == get_today_date_key() && cache.metadata.version == 1
}

#[tauri::command]
pub async fn load_student_cache(app_handle: AppHandle) -> Result<Option<StudentCacheData>, String> {
    let cache_path = get_student_cache_path(&app_handle)?;

    // Check if file exists
    if !cache_path.exists() {
        return Ok(None);
    }

    let json_data = fs::read_to_string(&cache_path)
        .map_err(|e| format!("Failed to read student cache file: {}", e))?;

    let cache: StudentCacheData = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse student cache: {}", e))?;

    // Validate cache (check if it's for today and has correct version)
    if !is_cache_valid(&cache) {
        // Cache is outdated or invalid, return None to create new cache
        return Ok(None);
    }

    Ok(Some(cache))
}

#[tauri::command]
pub async fn save_student_cache(
    app_handle: AppHandle,
    settings: StudentCacheData,
) -> Result<(), String> {
    let cache = settings;
    let cache_path = get_student_cache_path(&app_handle)?;

    // Update last sync timestamp
    let mut updated_cache = cache;
    updated_cache.metadata.last_sync = chrono::Utc::now().to_rfc3339();

    let json_data = serde_json::to_string_pretty(&updated_cache)
        .map_err(|e| format!("Failed to serialize student cache: {}", e))?;

    fs::write(&cache_path, json_data)
        .map_err(|e| format!("Failed to write student cache file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn clear_student_cache(app_handle: AppHandle) -> Result<(), String> {
    let cache_path = get_student_cache_path(&app_handle)?;

    // If file exists, remove it
    if cache_path.exists() {
        fs::remove_file(&cache_path)
            .map_err(|e| format!("Failed to remove student cache file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn cleanup_old_student_caches(app_handle: AppHandle) -> Result<i32, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let mut removed_count = 0;
    let today = get_today_date_key();

    // Read directory contents
    let entries = fs::read_dir(&app_data_dir)
        .map_err(|e| format!("Failed to read app data directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();

        // Check if it's a student cache file and not today's
        if file_name_str.starts_with("student_cache_") && file_name_str.ends_with(".json") {
            // Extract date from filename
            if let Some(date_part) = file_name_str
                .strip_prefix("student_cache_")
                .and_then(|s| s.strip_suffix(".json"))
            {
                // If it's not today's cache, remove it
                if date_part != today {
                    if let Err(e) = fs::remove_file(entry.path()) {
                        eprintln!(
                            "Warning: Failed to remove old cache file {}: {}",
                            file_name_str, e
                        );
                    } else {
                        removed_count += 1;
                    }
                }
            }
        }
    }

    Ok(removed_count)
}

#[tauri::command]
pub async fn get_cache_stats(app_handle: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let cache_path = get_student_cache_path(&app_handle)?;

    // Check if file exists
    if !cache_path.exists() {
        return Ok(None);
    }

    let json_data = fs::read_to_string(&cache_path)
        .map_err(|e| format!("Failed to read student cache file: {}", e))?;

    let cache: StudentCacheData = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse student cache: {}", e))?;

    // Calculate stats
    let total_entries = cache.students.len();
    let checked_in_count = cache
        .students
        .values()
        .filter(|s| s.status == "checked_in")
        .count();
    let checked_out_count = cache
        .students
        .values()
        .filter(|s| s.status == "checked_out")
        .count();

    let stats = serde_json::json!({
        "total_entries": total_entries,
        "checked_in_count": checked_in_count,
        "checked_out_count": checked_out_count,
        "date_created": cache.metadata.date_created,
        "last_sync": cache.metadata.last_sync,
        "version": cache.metadata.version
    });

    Ok(Some(stats))
}
