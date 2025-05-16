use serde::{Serialize, Deserialize};
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub api_url: String,
    pub device_id: String,
    pub spi_bus: u8,
    pub spi_slave_select: u8,
    pub reset_pin: u8,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_url: "http://localhost:8000/api".to_string(),
            device_id: "pyreportal-dev".to_string(),
            spi_bus: 0,
            spi_slave_select: 0,
            reset_pin: 25,
        }
    }
}

impl AppConfig {
    pub fn load() -> Self {
        // First check if a config file exists
        let config_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("pyreportal")
            .join("config.json");
            
        let config_result = match fs::read_to_string(&config_path) {
            Ok(content) => serde_json::from_str::<AppConfig>(&content).ok(),
            Err(_) => None,
        };
        
        if let Some(config) = config_result {
            return config;
        }
        
        // Otherwise use environment variables or defaults
        let mut config = Self::default();
        
        if let Ok(api_url) = env::var("PYREPORTAL_API_URL") {
            config.api_url = api_url;
        } else {
            // Use built-in defaults based on build profile
            #[cfg(not(debug_assertions))]
            {
                config.api_url = "https://phoenix-project-api.example.com/api".to_string();
            }
        }
        
        // Get other configuration from environment if available
        if let Ok(device_id) = env::var("PYREPORTAL_DEVICE_ID") {
            config.device_id = device_id;
        }
        
        // Hardware configuration
        if let Ok(spi_bus) = env::var("PYREPORTAL_SPI_BUS") {
            if let Ok(val) = spi_bus.parse() {
                config.spi_bus = val;
            }
        }
        
        if let Ok(spi_slave_select) = env::var("PYREPORTAL_SPI_SLAVE_SELECT") {
            if let Ok(val) = spi_slave_select.parse() {
                config.spi_slave_select = val;
            }
        }
        
        if let Ok(reset_pin) = env::var("PYREPORTAL_RESET_PIN") {
            if let Ok(val) = reset_pin.parse() {
                config.reset_pin = val;
            }
        }
        
        config
    }
    
    pub fn save(&self) -> std::io::Result<()> {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("pyreportal");
            
        fs::create_dir_all(&config_dir)?;
        
        let config_path = config_dir.join("config.json");
        let content = serde_json::to_string_pretty(self)?;
        
        fs::write(config_path, content)
    }
}