# Rust Backend - Tauri Commands & Hardware Integration

This directory contains the Rust backend for PyrePortal, providing system access, file persistence, and RFID hardware integration.

## File Structure

### Core Files
- `lib.rs` (98 lines) - Main entry point, command registration, app setup
- `main.rs` (~10 lines) - Binary entry point (minimal, just calls lib.rs)

### Modules
- `logging.rs` (~200 lines) - File-based logging with rotation
- `rfid.rs` (~400 lines) - RFID hardware abstraction + mock implementation
- `session_storage.rs` (~150 lines) - Session settings persistence
- `student_cache.rs` (~200 lines) - Student data caching

### Binaries (Testing)
- `bin/rfid_test.rs` - Single RFID scan test
- `bin/rfid_test_persistent.rs` - Continuous RFID scanning

## Tauri Command Pattern

### Command Template
```rust
#[tauri::command]
fn command_name(param: String) -> Result<ReturnType, String> {
    // Implementation
    do_work(param)
        .map_err(|e| format!("Operation failed: {}", e))
}
```

### Registration (lib.rs)
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // ... existing commands
            command_name
        ])
        .setup(|app| {
            // Initialization
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Frontend Usage
```typescript
import { safeInvoke } from '../utils/tauriContext';

const result = await safeInvoke<ReturnType>('command_name', { param: 'value' });
```

## Key Commands

### Configuration (lib.rs:17-32)
```rust
#[tauri::command]
fn get_api_config() -> Result<ApiConfig, String> {
    let api_base_url = env::var("API_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());

    let device_api_key = env::var("DEVICE_API_KEY")
        .map_err(|_| "DEVICE_API_KEY not found in environment".to_string())?;

    Ok(ApiConfig {
        api_base_url,
        device_api_key,
    })
}
```

### Logging (logging.rs)
```rust
#[tauri::command]
fn write_log(entry: String) -> Result<(), String>

#[tauri::command]
fn get_log_files() -> Result<Vec<String>, String>

#[tauri::command]
fn cleanup_old_logs(max_age_days: u64) -> Result<(), String>
```

**Log File Locations:**
- macOS: `~/Library/Logs/pyreportal/app_YYYYMMDD_HHMMSS.log`
- Linux: `~/.config/pyreportal/logs/app_YYYYMMDD_HHMMSS.log`
- Windows: `%APPDATA%\pyreportal\logs\app_YYYYMMDD_HHMMSS.log`

### RFID (rfid.rs)
```rust
#[tauri::command]
fn initialize_rfid_service() -> Result<(), String>

#[tauri::command]
fn scan_rfid() -> Result<Option<String>, String>

#[tauri::command]
fn stop_rfid_scanning() -> Result<(), String>
```

**Hardware Support:**
- **Production**: MFRC522 reader via SPI (ARM/ARM64 Linux only)
- **Development**: Mock scanning with `VITE_ENABLE_RFID=false`

### Session Storage (session_storage.rs)
```rust
#[tauri::command]
fn save_session_settings(settings: SessionSettings) -> Result<(), String>

#[tauri::command]
fn load_session_settings() -> Result<Option<SessionSettings>, String>

#[tauri::command]
fn clear_session() -> Result<(), String>
```

### Student Cache (student_cache.rs)
```rust
#[tauri::command]
fn cache_student(tag_id: String, student_data: StudentData) -> Result<(), String>

#[tauri::command]
fn get_cached_student(tag_id: String) -> Result<Option<StudentData>, String>

#[tauri::command]
fn clear_student_cache() -> Result<(), String>
```

**Cache Strategy:**
- Daily JSON files: `student_cache_YYYYMMDD.json`
- Automatic invalidation on date change
- Platform-specific app data directory

## Error Handling

### Return Pattern
```rust
// Always return Result<T, String>
fn do_something() -> Result<DataType, String> {
    let data = fetch_data()
        .map_err(|e| format!("Failed to fetch: {}", e))?;

    Ok(data)
}
```

### Logging Errors
```rust
fn do_something() -> Result<(), String> {
    match risky_operation() {
        Ok(result) => {
            eprintln!("[INFO] Operation succeeded");
            Ok(result)
        }
        Err(e) => {
            eprintln!("[ERROR] Operation failed: {:?}", e);
            Err(format!("User-friendly message: {}", e))
        }
    }
}
```

## File System Operations

### App Data Directory
```rust
use tauri::Manager;

fn get_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}
```

### Writing JSON Files
```rust
use serde::{Serialize, Deserialize};
use std::fs;

#[derive(Serialize, Deserialize)]
struct Settings {
    room_id: Option<i32>,
    activity_id: Option<i32>,
}

fn save_settings(settings: &Settings, path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Serialization failed: {}", e))?;

    fs::write(path, json)
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok(())
}
```

### Reading JSON Files
```rust
fn load_settings(path: &Path) -> Result<Settings, String> {
    if !path.exists() {
        return Ok(Settings::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Read failed: {}", e))?;

    let settings: Settings = serde_json::from_str(&content)
        .map_err(|e| format!("Deserialization failed: {}", e))?;

    Ok(settings)
}
```

## RFID Hardware Integration

### Production (Raspberry Pi)
```rust
// rfid.rs - ARM/ARM64 Linux only
#[cfg(all(
    any(target_arch = "aarch64", target_arch = "arm"),
    target_os = "linux"
))]
use mfrc522::Mfrc522;
use rppal::gpio::Gpio;
use rppal::spi::{Bus, SlaveSelect, Spi};

fn init_hardware() -> Result<Mfrc522<...>, String> {
    let spi = Spi::new(Bus::Spi0, SlaveSelect::Ss0, 1_000_000, spidev::SpiMode::Mode0)
        .map_err(|e| format!("SPI init failed: {}", e))?;

    let gpio = Gpio::new()
        .map_err(|e| format!("GPIO init failed: {}", e))?;

    let pin = gpio.get(25)
        .map_err(|e| format!("Pin init failed: {}", e))?
        .into_output();

    Ok(Mfrc522::new(spi).init())
}
```

### Mock (Development)
```rust
// Mock RFID scanning for non-ARM platforms
#[cfg(not(all(
    any(target_arch = "aarch64", target_arch = "arm"),
    target_os = "linux"
)))]
fn scan_rfid() -> Result<Option<String>, String> {
    // Return mock tag from env var
    let mock_tags = env::var("VITE_MOCK_RFID_TAGS")
        .unwrap_or_default();

    if !mock_tags.is_empty() {
        let tags: Vec<&str> = mock_tags.split(',').collect();
        // Return random tag
        Ok(Some(tags[0].to_string()))
    } else {
        Ok(None)
    }
}
```

## Async Operations

### Using Tokio
```rust
use tokio::time::{sleep, Duration};

#[tauri::command]
async fn async_operation() -> Result<String, String> {
    // Async work
    sleep(Duration::from_secs(2)).await;

    Ok("Completed".to_string())
}
```

### Background Tasks
```rust
use std::sync::OnceLock;
use tokio::task;

static RFID_SERVICE: OnceLock<tokio::sync::Mutex<RfidService>> = OnceLock::new();

#[tauri::command]
fn initialize_rfid_service() -> Result<(), String> {
    let service = RfidService::new()?;
    RFID_SERVICE.set(tokio::sync::Mutex::new(service))
        .map_err(|_| "Service already initialized".to_string())?;

    // Spawn background task
    task::spawn(async {
        loop {
            // Background work
            sleep(Duration::from_millis(100)).await;
        }
    });

    Ok(())
}
```

## Testing

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_load_session() {
        let settings = SessionSettings {
            room_id: Some(1),
            activity_id: Some(10),
        };

        let result = save_session_settings(settings.clone());
        assert!(result.is_ok());

        let loaded = load_session_settings().unwrap();
        assert_eq!(loaded.room_id, Some(1));
    }
}
```

### Running Tests
```bash
cd src-tauri
cargo test              # All tests
cargo test session      # Specific module
cargo test -- --nocapture  # Show println! output
```

### RFID Hardware Tests
```bash
# Single scan test
cd src-tauri
./test_rfid.sh

# Continuous scanning
./test_rfid_persistent.sh
```

## Dependencies (Cargo.toml)

### Core
- `tauri = "2"` - Desktop app framework
- `serde = { version = "1", features = ["derive"] }` - Serialization
- `serde_json = "1"` - JSON handling
- `tokio = { version = "1", features = ["time", "rt", "rt-multi-thread", "sync"] }` - Async runtime

### Utilities
- `chrono = { version = "0.4", features = ["serde"] }` - Date/time
- `dotenvy = "0.15"` - .env file loading
- `rand = "0.8"` - Random number generation

### Platform-Specific (ARM/ARM64 Linux)
```toml
[target.'cfg(all(any(target_arch = "aarch64", target_arch = "arm"), target_os = "linux"))'.dependencies]
mfrc522 = { version = "0.8.0", features = ["eh02"] }
rppal = "0.14.1"
embedded-hal = "0.2.7"
linux-embedded-hal = "0.3.2"
```

## Development Commands

```bash
# Check syntax/types (fast)
cargo check

# Lint (strict)
cargo clippy

# Format
cargo fmt

# Build
cargo build                 # Debug
cargo build --release      # Production

# Run standalone binary
cargo run --bin rfid_test
```

## Adding New Command

1. **Define command function**:
```rust
#[tauri::command]
fn my_command(param: String) -> Result<ReturnType, String> {
    // Implementation
    Ok(ReturnType { ... })
}
```

2. **Register in lib.rs**:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing
    my_command
])
```

3. **Use in frontend**:
```typescript
const result = await safeInvoke<ReturnType>('my_command', { param: 'value' });
```
