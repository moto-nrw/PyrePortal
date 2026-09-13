# RFID scan contract (PyrePortal #367)

## Ownership and compatibility

Phoenix processes `/api/iot/checkin`; PyrePortal sends scans and renders the
result. The request still includes `action: "checkin"` for wire compatibility:
Phoenix validates this legacy field but determines the transition itself.
The device bearer token and staff headers are unchanged.

Deploy the Phoenix change before the new kiosk. Existing kiosks remain
compatible. A kiosk rollback is supported with the new backend; do not roll
back the backend contract while the new kiosk depends on it.

## Results

`RfidScanResponse` models the server response; `RfidScanResult` adds local
presentation states and metadata. A successful response must not be rewritten.

| Server action              | Existing kiosk presentation                            |
| -------------------------- | ------------------------------------------------------ |
| `checked_in`               | Greeting and room, with pickup time when supplied      |
| `checked_out`              | Checkout destination chooser                           |
| `checked_out_daily`        | The same checkout destination chooser                  |
| `transferred`              | Room transfer result                                   |
| `supervisor_authenticated` | Supervisor greeting or repeat-scan navigation          |
| `no_action`                | Existing neutral fallback; no attendance count delta   |
| `pickup_info`              | Read-only pickup information, from the pickup endpoint |

Phoenix guarantees `daily_checkout_available: true` for a detailed
`checked_out_daily` result. For ordinary checkout, Phoenix evaluates the
availability policy. The kiosk does not infer availability from `action`.
Both checkout actions keep the existing destination buttons and timing.
Selecting home still calls `/api/iot/attendance/toggle` with
`confirm_daily_checkout`; this refactor does not change attendance writes.

Detailed results include `visit_id` (possibly null), checkout/feedback flags,
and optional `active_students` and `pickup_time`. `previous_room` is only
included for a transfer when known. Binary results omit the visit ID and
return false checkout/feedback flags. Supervisor results omit these fields;
success confirms the backend has already stored the supervisor assignment.

`active_students` refers to the requested room. Destination scans must not
replace the source room's count. Existing display-only optimistic deltas
remain when a count is missing; they never determine an attendance write.

## Errors and kiosk state

`STUDENT_ALREADY_ACTIVE`, `ROOM_CAPACITY_EXCEEDED`, and
`ACTIVITY_CAPACITY_EXCEEDED` identify domain failures independently of message
wording. Optional details may be omitted. Keep existing German copy and its
missing-detail fallbacks. Unstructured errors still use the existing text
translation, but text does not determine an attendance outcome.

The processing queue and adapter scan IDs suppress concurrent duplicate
hardware events, not legitimate sequential scans. Failed requests release the
queue. No automatic attendance retry or background write is introduced.

The existing home-confirmation failure behavior intentionally remains:
feedback or farewell continues using the scan's feedback flag. Changing that
behavior requires a separate product decision.

## Regression coverage

- Page tests run unchanged visible expectations for both checkout actions.
- API tests prove the action and availability flag are passed through.
- Hook tests cover rapid scans, concurrent duplicates, repeat delivery,
  network failure and a successful new scan after recovery.
- Destination tests await the actual server result, not an obsolete local
  background-sync promise.
- Phoenix workflow and HTTP wire tests cover daily flags, structured conflict
  codes, optional fields, supervisor idempotency, and transfer rollback.

Browser screenshot comparison uses deterministic API responses and a fixed
1280×800 viewport. Real-device NFC testing remains distinct from the GKT
bridge simulation and must be reported separately.

Run the repeatable visual parity check without a live backend (port 1420 must
be free):

```bash
VITE_API_BASE_URL=http://localhost:8080 VITE_DEVICE_API_KEY=local-test-only pnpm exec playwright test screenshots/rfid-parity.spec.ts
```

The test intercepts API requests, blocks external requests, freezes time,
and compares PNG hashes for both server checkout actions. It attaches all six
screenshots to the Playwright result. During #367 implementation, the three
screens were also captured before the source changes and compared against the
updated kiosk: destination chooser, feedback, and farewell were pixel-identical.
