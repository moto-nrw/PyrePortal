//! PN5180 command codes, registers, and constants
//!
//! Reference: NXP PN5180 Datasheet, pyPN5180 library, ATrappmann/PN5180-Library

// === SPI Commands ===
pub const CMD_WRITE_REGISTER: u8 = 0x00;
pub const CMD_WRITE_REGISTER_OR_MASK: u8 = 0x01;
pub const CMD_WRITE_REGISTER_AND_MASK: u8 = 0x02;
pub const CMD_READ_REGISTER: u8 = 0x04;
pub const CMD_WRITE_EEPROM: u8 = 0x06;
pub const CMD_READ_EEPROM: u8 = 0x07;
pub const CMD_SEND_DATA: u8 = 0x09;
pub const CMD_READ_DATA: u8 = 0x0A;
pub const CMD_SWITCH_MODE: u8 = 0x0B;
pub const CMD_LOAD_RF_CONFIG: u8 = 0x11;
pub const CMD_RF_ON: u8 = 0x16;
pub const CMD_RF_OFF: u8 = 0x17;

// === Registers ===
pub const REG_SYSTEM_CONFIG: u8 = 0x00;
pub const REG_IRQ_ENABLE: u8 = 0x01;
pub const REG_IRQ_STATUS: u8 = 0x02;
pub const REG_IRQ_CLEAR: u8 = 0x03;
pub const REG_TRANSCEIVE_CONTROL: u8 = 0x04;
pub const REG_TIMER1_RELOAD: u8 = 0x0C;
pub const REG_TIMER1_CONFIG: u8 = 0x0F;
pub const REG_RX_WAIT_CONFIG: u8 = 0x11;
pub const REG_CRC_RX_CONFIG: u8 = 0x12;
pub const REG_RX_STATUS: u8 = 0x13;
pub const REG_CRC_TX_CONFIG: u8 = 0x19;
pub const REG_RF_STATUS: u8 = 0x1D;
pub const REG_SYSTEM_STATUS: u8 = 0x24;
pub const REG_TEMP_CONTROL: u8 = 0x25;

// === EEPROM Addresses ===
pub const EEPROM_DIE_IDENTIFIER: u8 = 0x00;
pub const EEPROM_PRODUCT_VERSION: u8 = 0x10;
pub const EEPROM_FIRMWARE_VERSION: u8 = 0x12;
pub const EEPROM_EEPROM_VERSION: u8 = 0x14;
pub const EEPROM_IRQ_PIN_CONFIG: u8 = 0x1A;

// === IRQ Status Bits ===
pub const IRQ_RX_DONE: u32 = 1 << 0;
pub const IRQ_TX_DONE: u32 = 1 << 1;
pub const IRQ_IDLE: u32 = 1 << 2;
pub const IRQ_RFOFF_DET: u32 = 1 << 6;
pub const IRQ_RFON_DET: u32 = 1 << 7;
pub const IRQ_GENERAL_ERROR: u32 = 1 << 17;

// === RF Configuration (ISO 15693) ===
pub const RF_CONFIG_ISO15693_TX: u8 = 0x0D;
pub const RF_CONFIG_ISO15693_RX: u8 = 0x8D;

// === ISO 15693 Inventory Command ===
/// Flags: High data rate, single slot, inventory mode
pub const ISO15693_INVENTORY_FLAGS: u8 = 0x26;
/// Command code for inventory
pub const ISO15693_CMD_INVENTORY: u8 = 0x01;

// === GPIO Pins (BCM numbering) ===
pub const GPIO_RST: u8 = 22;
pub const GPIO_BUSY: u8 = 25;

// === Timing Constants ===
/// Reset pulse duration in microseconds
pub const RESET_PULSE_US: u64 = 50;
/// Time to wait after reset for startup in milliseconds
pub const RESET_STARTUP_MS: u64 = 2;
/// BUSY pin timeout in milliseconds
pub const BUSY_TIMEOUT_MS: u64 = 100;
/// BUSY pin polling interval in microseconds
pub const BUSY_POLL_US: u64 = 100;
/// RF field stabilization time in milliseconds
pub const RF_STABILIZE_MS: u64 = 5;
/// Card response wait time in milliseconds
pub const CARD_RESPONSE_MS: u64 = 20;

// Suppress warnings for unused constants during development
#[allow(dead_code)]
const _: () = {
    let _ = CMD_WRITE_EEPROM;
    let _ = CMD_SWITCH_MODE;
    let _ = REG_SYSTEM_CONFIG;
    let _ = REG_IRQ_ENABLE;
    let _ = REG_TRANSCEIVE_CONTROL;
    let _ = REG_TIMER1_RELOAD;
    let _ = REG_TIMER1_CONFIG;
    let _ = REG_RX_WAIT_CONFIG;
    let _ = REG_CRC_RX_CONFIG;
    let _ = REG_CRC_TX_CONFIG;
    let _ = REG_RF_STATUS;
    let _ = REG_SYSTEM_STATUS;
    let _ = REG_TEMP_CONTROL;
    let _ = EEPROM_DIE_IDENTIFIER;
    let _ = EEPROM_FIRMWARE_VERSION;
    let _ = EEPROM_EEPROM_VERSION;
    let _ = EEPROM_IRQ_PIN_CONFIG;
    let _ = IRQ_RX_DONE;
    let _ = IRQ_TX_DONE;
    let _ = IRQ_IDLE;
    let _ = IRQ_RFOFF_DET;
    let _ = IRQ_RFON_DET;
    let _ = IRQ_GENERAL_ERROR;
};
