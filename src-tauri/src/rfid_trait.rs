//! Common trait for RFID readers
//!
//! This trait abstracts over different RFID reader hardware (MFRC522, PN5180)
//! allowing runtime selection via the RFID_READER environment variable.

/// Common interface for RFID readers (MFRC522, PN5180)
pub trait RfidReader: Send {
    /// Perform a single scan attempt
    ///
    /// Returns:
    /// - `Ok(Some(uid))` if a tag was successfully read
    /// - `Ok(None)` if no tag is present
    /// - `Err(msg)` on hardware error
    fn scan(&mut self) -> Result<Option<String>, String>;

    /// Reset the reader hardware
    fn reset(&mut self) -> Result<(), String>;

    /// Get reader type name for logging
    fn reader_type(&self) -> &'static str;
}
