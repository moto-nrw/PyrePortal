## ADDED Requirements

### Requirement: Activity scanning supports a read-only pickup query mode

The activity scanning flow SHALL allow users to switch the next RFID scan into a read-only pickup query that does not perform check-in or check-out.

#### Scenario: Pickup query mode routes the next scan to the pickup endpoint

- **GIVEN** the activity scanning page is open and pickup query mode is active
- **WHEN** a student RFID tag is scanned
- **THEN** the kiosk sends a read-only pickup query request instead of the normal RFID check-in request
- **AND** the kiosk returns to normal check-in mode after the modal flow completes

### Requirement: Pickup query mode shows a scan prompt and result

The activity scanning page SHALL show a timeout-driven modal prompt before the scan and a pickup result modal after a successful lookup.

#### Scenario: Prompt auto-closes when no scan arrives

- **GIVEN** pickup query mode is active and no RFID tag is scanned
- **WHEN** the prompt timeout expires
- **THEN** the prompt closes
- **AND** the kiosk returns to normal check-in mode

#### Scenario: Pickup result shows time and optional note

- **GIVEN** pickup query mode is active
- **AND** the backend returns pickup information for the scanned student
- **WHEN** the result modal is shown
- **THEN** the kiosk displays the pickup time
- **AND** it displays the pickup note when one is present
- **AND** it does not change the room student count
