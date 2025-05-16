use crate::auth;
use crate::cache::{self};
use crate::config::AppConfig;
use crate::rfid::interface::RfidTag;
use reqwest::Client;
use serde::{Serialize, Deserialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::time::{sleep, Duration};
use log::{info, warn, error};

// Track network connectivity status
static NETWORK_AVAILABLE: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    pub tag_id: String,
    pub terminal_id: String,
    pub timestamp: i64,
    pub room_id: Option<i32>,
    pub activity_id: Option<i32>,
    pub staff_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i32,
    pub name: String,
    pub is_checked_in: bool,
}

// Check network connectivity by pinging the server
async fn check_network() -> bool {
    let config = AppConfig::load();
    let client = Client::new();
    
    match client.get(format!("{}/health", config.api_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let success = response.status().is_success();
            NETWORK_AVAILABLE.store(success, Ordering::SeqCst);
            success
        },
        Err(_) => {
            NETWORK_AVAILABLE.store(false, Ordering::SeqCst);
            false
        }
    }
}

// Send tag scan to server with offline caching
pub async fn send_tag_to_server(
    tag: RfidTag,
    room_id: Option<i32>,
    activity_id: Option<i32>
) -> Result<Option<UserInfo>, String> {
    let config = AppConfig::load();
    let _token = auth::get_auth_token();
    let staff_id = auth::get_user_id();
    
    // Create scan request
    let terminal_id = config.device_id.clone();
    let _scan_request = ScanRequest {
        tag_id: tag.id.clone(),
        terminal_id,
        timestamp: tag.timestamp,
        room_id,
        activity_id,
        staff_id,
    };
    
    #[cfg(debug_assertions)]
    {
        // Mock implementation for development
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        // Simulate API response
        match tag.id.as_str() {
            "1234567890" => Ok(Some(UserInfo {
                id: 1,
                name: "Jane Smith".to_string(),
                is_checked_in: false, // Will check in
            })),
            "0987654321" => Ok(Some(UserInfo {
                id: 2,
                name: "John Doe".to_string(),
                is_checked_in: true, // Will check out
            })),
            _ => Ok(None), // Unknown tag
        }
    }
    
    #[cfg(not(debug_assertions))]
    {
        // Check if network is available or test connection
        if !NETWORK_AVAILABLE.load(Ordering::SeqCst) && !check_network().await {
            // Network not available, cache the scan for later
            info!("Network unavailable, caching scan for tag {}", tag.id);
            
            let pending_scan = PendingScan::new(
                tag.id,
                scan_request.terminal_id,
                scan_request.timestamp,
                scan_request.room_id,
                scan_request.activity_id,
                scan_request.staff_id,
            );
            
            cache::cache_scan(pending_scan)
                .map_err(|e| format!("Failed to cache scan: {}", e))?;
            
            return Err("Network unavailable. Scan saved for later processing.".to_string());
        }
        
        // Network available, check if authentication is valid
        if token.is_none() {
            // No authentication, cache the scan
            info!("No authentication token, caching scan for tag {}", tag.id);
            
            let pending_scan = PendingScan::new(
                tag.id,
                scan_request.terminal_id,
                scan_request.timestamp,
                scan_request.room_id,
                scan_request.activity_id,
                scan_request.staff_id,
            );
            
            cache::cache_scan(pending_scan)
                .map_err(|e| format!("Failed to cache scan: {}", e))?;
            
            return Err("Authentication required. Scan saved for later processing.".to_string());
        }
        
        // Attempt to send scan to server
        let client = Client::new();
        let response = client.post(format!("{}/rfid/scan", config.api_url))
            .bearer_auth(token.unwrap())
            .json(&scan_request)
            .timeout(Duration::from_secs(10))
            .send()
            .await;
            
        match response {
            Ok(response) => {
                if response.status().is_success() {
                    let user_info = response.json::<Option<UserInfo>>()
                        .await
                        .map_err(|e| format!("Failed to parse response: {}", e))?;
                        
                    // After successful API call, process any cached scans
                    tokio::spawn(process_cached_scans());
                    
                    Ok(user_info)
                } else {
                    // Handle common error cases
                    match response.status().as_u16() {
                        401 => {
                            // Auth expired, cache the scan
                            let pending_scan = PendingScan::new(
                                tag.id,
                                scan_request.terminal_id,
                                scan_request.timestamp,
                                scan_request.room_id,
                                scan_request.activity_id,
                                scan_request.staff_id,
                            );
                            
                            cache::cache_scan(pending_scan)
                                .map_err(|e| format!("Failed to cache scan: {}", e))?;
                                
                            Err("Authentication expired. Scan saved for later processing.".to_string())
                        },
                        403 => Err("Not authorized to scan RFID tags.".to_string()),
                        404 => Ok(None), // Tag not found/registered
                        _ => Err(format!("Server error: {}", response.status()))
                    }
                }
            },
            Err(e) => {
                // Network error, cache the scan
                warn!("Failed to send scan: {}", e);
                NETWORK_AVAILABLE.store(false, Ordering::SeqCst);
                
                let pending_scan = PendingScan::new(
                    tag.id,
                    scan_request.terminal_id,
                    scan_request.timestamp,
                    scan_request.room_id,
                    scan_request.activity_id,
                    scan_request.staff_id,
                );
                
                cache::cache_scan(pending_scan)
                    .map_err(|e| format!("Failed to cache scan: {}", e))?;
                    
                Err("Network error. Scan saved for later processing.".to_string())
            }
        }
    }
}

// Process any cached scans
// This runs in a separate task to avoid blocking
async fn process_cached_scans() {
    use std::sync::atomic::AtomicBool;
    static PROCESSING: AtomicBool = AtomicBool::new(false);
    
    // Only one thread should process at a time
    if PROCESSING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }
    
    // Ensure we reset the processing flag when done
    let _guard = scopeguard::guard((), |_| {
        PROCESSING.store(false, Ordering::SeqCst);
    });
    
    // Check if network is available
    if !NETWORK_AVAILABLE.load(Ordering::SeqCst) && !check_network().await {
        return;
    }
    
    // Check if we have authentication
    let token = match auth::get_auth_token() {
        Some(token) => token,
        None => return,
    };
    
    // Get cached scans
    let cached_scans = match cache::get_cached_scans() {
        Ok(scans) => scans,
        Err(e) => {
            error!("Failed to get cached scans: {}", e);
            return;
        }
    };
    
    if cached_scans.is_empty() {
        return;
    }
    
    info!("Processing {} cached scans", cached_scans.len());
    
    let config = AppConfig::load();
    let client = Client::new();
    
    // Process each scan
    for mut scan in cached_scans {
        // Skip scans that have been attempted too many times
        if scan.attempts >= 3 {
            warn!("Scan for tag {} has failed too many times, skipping", scan.tag_id);
            continue;
        }
        
        // Increment attempt counter
        scan.attempts += 1;
        if let Err(e) = cache::update_cached_scan(&scan) {
            error!("Failed to update cached scan: {}", e);
        }
        
        // Convert to API request
        let request = ScanRequest {
            tag_id: scan.tag_id.clone(),
            terminal_id: scan.terminal_id.clone(),
            timestamp: scan.timestamp,
            room_id: scan.room_id,
            activity_id: scan.activity_id,
            staff_id: scan.staff_id,
        };
        
        // Send to server
        match client.post(format!("{}/rfid/scan", config.api_url))
            .bearer_auth(&token)
            .json(&request)
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    // Successfully processed, remove from cache
                    info!("Successfully processed cached scan for tag {}", scan.tag_id);
                    if let Err(e) = cache::remove_cached_scan(&scan) {
                        error!("Failed to remove cached scan: {}", e);
                    }
                } else if response.status().as_u16() == 401 {
                    // Auth expired, stop processing
                    warn!("Authentication expired while processing cached scans");
                    break;
                }
            },
            Err(e) => {
                // Network error, stop processing
                warn!("Network error while processing cached scans: {}", e);
                NETWORK_AVAILABLE.store(false, Ordering::SeqCst);
                break;
            }
        }
        
        // Add a short delay between requests
        sleep(Duration::from_millis(500)).await;
    }
}

// Start a background task to periodically process cached scans
pub async fn start_cache_processor(_app_handle: tauri::AppHandle) {
    tokio::spawn(async move {
        loop {
            // Process cached scans every 5 minutes
            sleep(Duration::from_secs(300)).await;
            process_cached_scans().await;
            
            // Also check for network connectivity
            if !NETWORK_AVAILABLE.load(Ordering::SeqCst) {
                check_network().await;
            }
        }
    });
}