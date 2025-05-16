use super::interface::{RfidReader, RfidTag, RfidError};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::AppHandle;
use chrono::Utc;
use std::time::Duration;
use log::info;

pub struct MockRfidReader {
    scanning: Arc<Mutex<bool>>,
    scan_thread: Option<thread::JoinHandle<()>>,
    app_handle: Option<AppHandle>,
}

impl MockRfidReader {
    pub fn new() -> Self {
        Self {
            scanning: Arc::new(Mutex::new(false)),
            scan_thread: None,
            app_handle: None,
        }
    }
    
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }
}

impl RfidReader for MockRfidReader {
    fn start_scan(&mut self) -> Result<(), RfidError> {
        let app_handle = match &self.app_handle {
            Some(handle) => handle.clone(),
            None => return Err(RfidError::Configuration("App handle not set".into())),
        };
        
        let scanning = self.scanning.clone();
        *scanning.lock().unwrap() = true;
        
        info!("Starting mock RFID scanning thread");
        
        // Create a list of mock tags
        let mock_tags = vec![
            "1234567890",  // Will check in Jane Smith
            "0987654321",  // Will check out John Doe
            "5556667777",  // Unknown tag
        ];
        
        self.scan_thread = Some(thread::spawn(move || {
            info!("🔍 Mock RFID scanner started");
            
            // For development, simulate occasional tag scans
            let mut counter = 0;
            while *scanning.lock().unwrap() {
                thread::sleep(Duration::from_secs(3));
                
                if !*scanning.lock().unwrap() {
                    break;
                }
                
                // Every 3rd cycle, simulate a tag scan
                counter += 1;
                if counter % 3 == 0 {
                    // Cycle through the mock tags
                    let tag_index = (counter / 3) % mock_tags.len();
                    let tag_id = mock_tags[tag_index];
                    
                    let tag = RfidTag {
                        id: tag_id.to_string(),
                        timestamp: Utc::now().timestamp(),
                    };
                    
                    info!("📱 Mock RFID tag detected: {}", tag_id);
                    let _ = app_handle.emit("rfid-tag-scanned", tag);
                }
                
                // Simulate occasional errors (every 10th cycle)
                if counter % 10 == 0 {
                    info!("🛑 Simulating a temporary RFID reader error");
                    let _ = app_handle.emit("rfid-error", "Simulated reader error".to_string());
                }
            }
            
            info!("🔍 Mock RFID scanner stopped");
        }));
        
        Ok(())
    }
    
    fn stop_scan(&mut self) -> Result<(), RfidError> {
        info!("Stopping mock RFID scanning");
        *self.scanning.lock().unwrap() = false;
        
        if let Some(thread) = self.scan_thread.take() {
            let _ = thread.join();
        }
        
        Ok(())
    }
    
    fn is_scanning(&self) -> bool {
        *self.scanning.lock().unwrap()
    }
}