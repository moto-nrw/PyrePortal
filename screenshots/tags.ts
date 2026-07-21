/**
 * Shared RFID tag constants for the screenshot tooling.
 *
 * SCREENSHOT_TAG is pinned as the ONLY mock tag for the screenshot run
 * (playwright.config.ts sets VITE_MOCK_RFID_TAGS to exactly this value),
 * so every mock scan — tag assignment and NFC scanning — is deterministic.
 *
 * UNKNOWN_TAG is never assigned to anyone and is used to deliberately
 * capture the error-modal state.
 */
export const SCREENSHOT_TAG = '04:D6:94:82:97:6A:80';
export const UNKNOWN_TAG = '04:99:99:99:99:99:99';
