# Legacy Tauri Backend

This directory contains the retired Rust/Tauri backend. PyrePortal no longer ships or supports a Tauri app.

## Target Scope

Do not add features, development workflows or release work here. Limit changes to removing the legacy target or keeping the existing source safe while it remains in the repository.

- GKT/GKTL is the production deployment path and uses the frontend GKT adapter with `system.js`.
- Browser mock is the local development target.
- Raspberry Pi/Balena and Tauri are retired targets.
- RFID scanning has no Rust backend: all mock scanning happens in the frontend (`src/dev/mockScanSource.ts` via the `useRfidScanning` hook). The retired MFRC522 hardware path and the Rust mock scan service have been removed.

## File Structure

- `lib.rs` - Main entry point, command registration, app setup
- `main.rs` - Binary entry point (minimal, just calls lib.rs)
- `logging.rs` - File-based logging with rotation
- `session_storage.rs` - Session settings persistence

## Tauri Command Pattern

### Command Template

```rust
#[tauri::command]
fn command_name(param: String) -> Result<ReturnType, String> {
    do_work(param)
        .map_err(|e| format!("Operation failed: {}", e))
}
```

### Registration (lib.rs)

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    command_name
])
```

### Frontend Usage

```typescript
import { safeInvoke } from './tauriContext'; // src/platform/tauri/tauriContext.ts

const result = await safeInvoke<ReturnType>('command_name', { param: 'value' });
```

Only the Tauri platform adapter (`src/platform/tauri/index.ts`) should call `safeInvoke`.

## Registered Commands

### Configuration (lib.rs)

```rust
#[tauri::command]
fn get_api_config() -> Result<ApiConfig, String>
```

Reads `API_BASE_URL` (fallback `VITE_API_BASE_URL`, default `http://localhost:8080`) and `DEVICE_API_KEY` (fallback `VITE_DEVICE_API_KEY`, required) from the environment / `.env` file.

### App Lifecycle (lib.rs)

```rust
#[tauri::command]
fn restart_app()
```

Exits the process; the local app simply quits.

### Logging (logging.rs)

```rust
#[tauri::command]
async fn write_log(app: AppHandle, entry: String) -> Result<(), String>
```

**Log File Locations:**

- macOS: `~/Library/Logs/pyreportal/app_YYYYMMDD_HHMMSS.log`
- Linux: `~/.config/pyreportal/logs/app_YYYYMMDD_HHMMSS.log`
- Windows: `%APPDATA%\pyreportal\logs\app_YYYYMMDD_HHMMSS.log`

### Session Storage (session_storage.rs)

```rust
#[tauri::command]
async fn save_session_settings(settings: SessionSettings) -> Result<(), String>

#[tauri::command]
async fn load_session_settings() -> Result<Option<SessionSettings>, String>

#[tauri::command]
async fn clear_last_session() -> Result<(), String>
```

## Error Handling

Always return `Result<T, String>`:

```rust
fn do_something() -> Result<DataType, String> {
    let data = fetch_data()
        .map_err(|e| format!("Failed to fetch: {}", e))?;

    Ok(data)
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

## Testing

```bash
cd src-tauri
cargo test              # All tests
cargo test session      # Specific module
cargo test -- --nocapture  # Show println! output
```

## Dependencies (Cargo.toml)

- `tauri = "2"` - Desktop app framework
- `tauri-plugin-opener = "2"`
- `serde` / `serde_json` - Serialization
- `chrono` - Date/time (log timestamps)
- `dotenvy` - .env file loading

Dev-only: `tempfile`, `tokio` (for `#[tokio::test]`), `tauri` with the `test` feature.

## Legacy Validation Commands

```bash
# Check syntax/types (fast)
cargo check

# Lint (strict, pedantic clippy is denied-by-default)
cargo clippy

# Format
cargo fmt

# Compile the legacy target when maintenance requires it
cargo build
```
