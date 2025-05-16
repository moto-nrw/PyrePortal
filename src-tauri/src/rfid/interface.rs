use serde::{Serialize, Deserialize};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RfidTag {
    pub id: String,
    pub timestamp: i64,
}

// Error types for RFID operations
#[derive(Debug)]
pub enum RfidError {
    Hardware(String),
    Communication(String),
    Configuration(String),
    Other(String),
}

impl Display for RfidError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            RfidError::Hardware(msg) => write!(f, "Hardware error: {}", msg),
            RfidError::Communication(msg) => write!(f, "Communication error: {}", msg),
            RfidError::Configuration(msg) => write!(f, "Configuration error: {}", msg),
            RfidError::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for RfidError {}

// Common interface for all RFID readers
pub trait RfidReader: Send + Sync {
    fn start_scan(&mut self) -> Result<(), RfidError>;
    fn stop_scan(&mut self) -> Result<(), RfidError>;
    fn is_scanning(&self) -> bool;
}