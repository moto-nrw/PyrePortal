# Change: Add RFID pickup query mode

## Why

Students need a kiosk-safe way to see today's pickup time without triggering a check-in or check-out.

## What Changes

- Add a dedicated RFID pickup query mode to the scanning flow
- Show a timeout-driven scan prompt and read-only pickup result modal on the activity scanning page
- Call a new backend IoT pickup query endpoint instead of the normal check-in workflow

## Impact

- Affected specs: `rfid-pickup-query`
- Affected code: `src/hooks/useRfidScanning.ts`, `src/pages/ActivityScanningPage.tsx`, `src/store/userStore.ts`, `src/services/api.ts`
