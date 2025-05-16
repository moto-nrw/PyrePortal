pub mod interface;

// Conditionally select the real implementation or mock
// based on platform AND configuration
#[cfg(all(target_os = "linux", not(feature = "mock_hardware")))]
pub mod raspberry_pi;

#[cfg(any(not(target_os = "linux"), feature = "mock_hardware"))]
pub mod mock;

// Export the appropriate implementation
#[cfg(all(target_os = "linux", not(feature = "mock_hardware")))]
pub use raspberry_pi::RaspberryPiRfidReader as PlatformRfidReader;

#[cfg(any(not(target_os = "linux"), feature = "mock_hardware"))]
pub use mock::MockRfidReader as PlatformRfidReader;