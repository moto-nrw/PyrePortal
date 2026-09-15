# Terminal and web fallback contract

Scope: [PyrePortal #365](https://github.com/moto-nrw/PyrePortal/issues/365), mirroring
[Phoenix #1452](https://github.com/moto-nrw/project-phoenix/issues/1452).
Compared on 2026-09-13 against PyrePortal `ea53f896379b481e57ec1326591d2b63f58272ba`
and Phoenix `d1d7dc356987fb07baf72a35baf96035bbdd0992`.

## Result

The web fallback already creates the room session and visits needed for detailed
attendance. No fallback flag, new IoT endpoint, or new kiosk screen is required.
Both entry paths call Phoenix's `active.CreateVisit`, which validates the target
session, prevents overlapping visits, checks room capacity, and creates or updates
daily attendance. This is state parity, not identical commands or attribution.

PyrePortal's existing result handling accepts these visits without knowing their
origin. Its `visit_id` type must allow `null`, as the detailed scan response can
explicitly return it. UI consumers already use null-safe checks.

## Web procedure and prerequisites

1. Open `Aktuelle Aufsicht` in Phoenix.
2. Use `Spontane Aktivität starten` to select an activity and room.
3. Check the child into the running activity.

The linked Phoenix investigation records `operations.presence_mode = detailed`,
`operations.care_concept = open_rooms`, `attendance.web_enabled = true`, and
`attendance.web_spontaneous_activities_enabled = true`, plus `schedules:read` and
an appropriate supervision assignment or admin access. The current spontaneous
start handler gates on open-rooms care and the spontaneous-activity setting,
requires a staff profile, rejects weekends and occupied rooms, and does not accept
children in the start request. Child check-in is a separate authorized operation.
Do not treat the removed `attendance.web_checkin_access` setting as a prerequisite.

If the failed terminal still owns an active room session, starting another session
can conflict. Use the existing session's web roster where permitted, or finish
the old activity before starting another. A terminal failure does not itself end
the backend session.

The school-wide check-in from the child detail view is **not** this fallback:
it records attendance without assigning a room/activity visit.

## State transitions

| Situation                                | Terminal scan in detailed mode                                                    | Web roster check-in                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| No open visit                            | Opens a visit in the room's active session and ensures attendance                 | Opens a visit in the selected active instance's session and ensures attendance |
| Already in the same current room/session | Closes the visit; same-room scan is a toggle                                      | Keeps the existing visit; repeated check-in is idempotent                      |
| Open visit elsewhere                     | Closes the previous visit and opens the target visit; returns `transferred`       | Uses the shared move operation to move the child to the target session         |
| Room visit ended                         | Room checkout is distinct from daily checkout                                     | Ending a room visit is distinct from school-wide checkout                      |
| Duplicate/racing input                   | Adapter scan-ID dedup and in-flight tag queue; backend rejects overlapping visits | Existing-visit lookup and duplicate-create recovery avoid a second visit       |

The terminal's request action is `checkin` even when the resulting action is
`checked_out` or `transferred`. Never derive the displayed result from that request
or replay a web check-in as a terminal scan. Previous-day session rollover is a
separate backend recovery case, not the normal same-room toggle.

## PyrePortal wire dependencies

| Endpoint                         | Request / response consumed by PyrePortal                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/iot/session/start`    | Sends `activity_id`, optional `room_id`, `supervisor_ids`, optional `force`; consumes `active_group_id`, `activity_id`, `device_id`, `start_time`, and `supervisors` |
| `GET /api/iot/session/current`   | Restores the device's session and polls `active_students`; inactive response or 404 means no current device session                                                  |
| `POST /api/iot/checkin`          | Sends `student_rfid`, `action: checkin`, `room_id`; consumes the nested `data` result below                                                                          |
| `POST /api/iot/session/activity` | Keeps the device session active; does not create local attendance                                                                                                    |

Requests use device bearer authentication and the staff PIN. Staff attribution
is not interchangeable with web JWT identity: Phoenix requires verified staff
authentication for optional kiosk attribution, not an unverified staff ID alone.
This comparison does not change authentication.

Scan result fields:

- `student_id`, `student_name`, `action`: result identity and presentation.
- `visit_id` (number, null, or omitted): visit identity and feedback reset tracking;
  `room_name`, optional `previous_room`: location presentation.
- Optional `active_students`: authoritative room/session count, including zero.
  The page retains its legacy delta fallback only when the field is absent.
- `daily_checkout_available`, `feedback_enabled`, `pickup_time`, `pickup_note`:
  existing checkout, feedback, and pickup presentation. The API client normalizes
  `checked_out_daily` to `checked_out` with daily checkout enabled.
- Error HTTP status, code, message, and details: existing German mappings and
  structured conflict handling, including `STUDENT_ALREADY_ACTIVE` → `already_in`.

No web roster response is passed to `RfidScanResult`: the web start endpoint returns
instance/session IDs, and the web check-in endpoint returns a roster. They are
separate API contracts. No new fallback-specific IoT errors were identified in
this flow, so error copy is unchanged.

## Attribution and terminal recovery

Web-created visits carry staff context; attendance without a physical device uses
Phoenix's configured virtual web device. Terminal attendance uses device context.
Visit entry/exit timestamps and attendance attribution remain available, but this
does not establish identical audit events or a dedicated fallback audit marker.
If audit-event parity beyond those records is required, it needs a separate
Phoenix requirement and backend verification.

The web spontaneous handler resolves or creates an activity group before starting
the instance, so its live group has an activity reference. This matters because
the IoT capacity path explicitly rejects template-less sessions. The normal web
fallback is not that unsupported legacy shape.

A web-started session has no physical `device_id`. PyrePortal's device-current
endpoint therefore must not be assumed to restore it automatically. Session
selection for a scan looks up open sessions by room and prefers one attached to
the scanning device. A scan can operate on an existing web session, but resuming
the complete kiosk UI still follows the normal session start/conflict flow.
Do not automatically force-start or overwrite a web session. Confirm the room,
activity, supervisors, and count through the normal recovery UI.

The client has no offline student cache or deferred attendance replay. Browser
mock and GKT adapters feed the same server-first scan hook; the browser mock
simulates tag input, not backend attendance.

## Verification and limits

The API regression cases preserve server-selected check-in, transfer, and checkout
results, including `active_students: 0` and nullable visit IDs. Existing hook,
session, page, and adapter tests cover the client layers separately. These mocked
tests cannot prove database state or physical NFC behavior.

For an end-to-end acceptance run against a local seeded Phoenix instance:

1. Configure detailed/open-rooms web fallback and record the initial attendance,
   room sessions, and open visits for test children.
2. Start a web activity in a free room and check in a child. Verify one open visit,
   matching session/room, daily attendance, and web attribution. Repeat the web
   check-in and verify no duplicate or checkout.
3. Resume the kiosk through its normal session flow. Scan that child in the same
   room and verify room checkout, then in another active room and verify the
   expected visit/transfer and authoritative count. Check capacity conflicts and
   the case where the old terminal session is still active.
4. Repeat with browser mock input and GKT `SYSTEM.onNfcScanned` input; include
   distinct rapid scans, duplicate event IDs, and an offline-to-online transition.
   Verify no local success or delayed replay for a failed request.
5. Verify persisted visits, attendance, session associations, and attribution
   after each transition. Physical-device verification remains a separate check.

### Observed verification (2026-09-13)

- Client: `pnpm run check`, all 57 Vitest files (1,253 tests), browser and GKT
  builds, formatting, and `git diff --check` passed. Vitest printed fetch-abort
  teardown diagnostics; Vite printed config-loader and chunk-size warnings.
- Backend: the focused commands below passed in all four packages. The IoT and
  active-service tests use isolated PostgreSQL fixtures; timetable tests include
  mocked dependencies. These runs are not a complete live browser handoff.
- Live localhost: `/health` returned `OK`; seeded school-admin logins succeeded.
  The `vollbetrieb` capability response disabled spontaneous activities (its
  care concept is fixed schedule). `anmeldung-wochenplan` enabled spontaneous
  activities, but its room list was empty. No demo attendance or tenant settings
  were changed.
- Local setup repair: the ignored Compose file lacked the server's
  `NEXT_PUBLIC_API_URL` mapping already present in the tracked example. Added it
  and corrected the ignored root env's public URL to `http://localhost:8080`,
  then recreated server/frontend. Phoenix's tracked working tree stayed clean.

Backend commands, from `project-phoenix/backend`:

```bash
../scripts/run-go-toolchain.sh go test -count=1 -parallel 8 ./api/iot/checkin ./api/timetable ./services/schedule -run 'TestDeviceCheckin_|TestOperationsCreateAndStartSpontaneous|TestTimetableOperationsCheckIn'
../scripts/run-go-toolchain.sh go test -count=1 -parallel 8 ./services/active -run 'TestCreateVisit_|TestWebManualDeviceCode|TestUpdateVisit_GroupMoveWithCheckout'
```

Remaining: the complete live web-start → web check-in → kiosk recovery sequence,
UI behavior across that sequence, and physical NFC. Today was Sunday; the
spontaneous-start weekend guard is covered by the passing backend tests, not a
live successful start. Do not mark these remaining checks complete from the
separate client and backend tests. A weekday test fixture with detailed mode,
open rooms, enabled web fallback, a room, and assigned staff is needed for the
live sequence without changing the server clock.

## Source map

Paths below are relative to the compared repository revisions above.

| Concern                                         | Source                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Terminal request and server-first result        | PyrePortal `src/hooks/useRfidScanning.ts`, `src/services/api.ts`                                 |
| Result counts and nullable visit consumers      | PyrePortal `src/hooks/pages/useActivityScanningPage.ts`                                          |
| Session recovery and conflicts                  | PyrePortal `src/services/sessionService.ts`                                                      |
| Error translation                               | PyrePortal `src/services/apiErrors.ts`, `src/services/scanProcessor.ts`                          |
| Web start validation and activity reference     | Phoenix `backend/api/timetable/operations.go`, `operations_unit_test.go`                         |
| Web session creation without device             | Phoenix `backend/services/schedule/instance_service.go`                                          |
| Web check-in, repeats, and moves                | Phoenix `backend/services/schedule/timetable_operations_service.go`                              |
| IoT same-room toggle and room-session selection | Phoenix `backend/modules/devicescan/internal/application/checkin.go`                             |
| IoT response keys and nullability               | Phoenix `backend/api/iot/checkin/response.go`                                                    |
| IoT delegates visit writes                      | Phoenix `backend/modules/devicescan/compose/presence.go`                                         |
| Shared visit and attendance writes              | Phoenix `backend/services/active/active_service.go`, `visit_helpers.go`, `visit_helpers_test.go` |
