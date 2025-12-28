# RFID Module Cognitive Complexity Refactoring

**Date**: 2025-12-28
**Issue**: #170
**Status**: Approved for implementation

## Problem

SonarCloud S3776 flagged 4 functions in `src-tauri/src/rfid.rs` exceeding the cognitive complexity threshold of 15:

| Function                            | Line | Complexity | Target |
| ----------------------------------- | ---- | ---------- | ------ |
| `background_scanning_loop`          | 101  | 21         | ≤15    |
| `continuous_scan_loop`              | 149  | 59         | ≤15    |
| `scan_with_persistent_scanner_sync` | 450  | 21         | ≤15    |
| `scan_rfid_hardware_with_timeout`   | 532  | 17         | ≤15    |

## Solution

Extract helper functions to reduce nesting and improve readability. No logic changes.

### New Helper Functions

**RfidBackgroundService (5 helpers):**

- `should_continue_scanning()` - check if scanning should continue
- `handle_successful_scan()` - update state and emit event on success
- `handle_scan_error()` - update state on real errors
- `handle_start_command()` - process Start command
- `handle_stop_command()` - process Stop command

**raspberry_pi module (4 helpers):**

- `initialize_mfrc522_scanner()` - SPI/GPIO/MFRC522 setup
- `select_card_with_retry()` - retry logic for IncompleteFrame errors
- `format_uid()` - format UID bytes as hex string

### Expected Results

| Function                            | Before | After |
| ----------------------------------- | ------ | ----- |
| `background_scanning_loop`          | 21     | ~8    |
| `continuous_scan_loop`              | 59     | ~12   |
| `scan_with_persistent_scanner_sync` | 21     | ~6    |
| `scan_rfid_hardware_with_timeout`   | 17     | ~10   |

## Testing

1. `cargo check` - compilation
2. `cargo clippy` - linting
3. `npm run tauri dev` - mock platform verification
4. `./test_rfid.sh` - hardware test (if Pi available)

## Risk

Low - pure refactoring, no logic changes.
