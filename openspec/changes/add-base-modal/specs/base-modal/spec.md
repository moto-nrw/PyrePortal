# Capability: Base Modal

Provides a unified foundation component for modal dialogs in PyrePortal, extracted from the ActivityScanningPage modal pattern.

## ADDED Requirements

### Requirement: Dark Backdrop Overlay

The modal SHALL render a dark semi-transparent backdrop when open.

#### Scenario: Modal opens with default backdrop

Given the modal `isOpen` prop is true
When the modal renders
Then a fixed-position backdrop covers the entire viewport
And the backdrop has `background-color: rgba(0, 0, 0, 0.7)`
And the backdrop has `z-index: 1000`

---

### Requirement: Consistent Container Styling

The modal container SHALL use standardized dimensions and styling.

#### Scenario: Modal container renders with default styling

Given the modal is open
When the container renders
Then the container has `border-radius: 32px`
And the container has `padding: 64px`
And the container has `max-width: 700px`
And the container has `width: 90%`
And the container is centered in the viewport

#### Scenario: Modal with custom background color

Given the modal has `backgroundColor="#83cd2d"`
When the container renders
Then the container has `background-color: #83cd2d`

---

### Requirement: Backdrop Click Dismissal

The modal MUST support dismissal by clicking the backdrop.

#### Scenario: Backdrop click closes modal (default)

Given the modal is open with default props
When the user clicks the backdrop (outside the container)
Then `onClose` is called

#### Scenario: Backdrop click disabled

Given the modal has `closeOnBackdropClick={false}`
When the user clicks the backdrop
Then `onClose` is NOT called

#### Scenario: Container click does not close modal

Given the modal is open
When the user clicks inside the container
Then `onClose` is NOT called

---

### Requirement: Auto-Close Timeout

The modal SHALL support automatic closing after a specified duration.

#### Scenario: Modal closes after timeout

Given the modal has `timeout={5000}`
When 5 seconds elapse
Then `onTimeout` is called (if provided)
And `onClose` is called

#### Scenario: No timeout when not specified

Given the modal has no `timeout` prop
When any amount of time elapses
Then `onClose` is NOT called automatically

#### Scenario: Timeout resets when resetKey changes

Given the modal has `timeout={5000}` and `timeoutResetKey="scan-1"`
And 3 seconds have elapsed
When `timeoutResetKey` changes to `"scan-2"`
Then the timeout restarts from 0
And the modal will close after another 5 seconds

---

### Requirement: Timeout Indicator Display

The modal SHALL display a visual progress bar showing remaining time before auto-close.

#### Scenario: Timeout indicator shown by default

Given the modal has `timeout={5000}`
When the modal is open
Then a `ModalTimeoutIndicator` is visible at the bottom
And the indicator animates from full width to zero over 5 seconds

#### Scenario: Timeout indicator can be hidden

Given the modal has `timeout={5000}` and `showTimeoutIndicator={false}`
When the modal is open
Then no timeout indicator is visible
But the modal still closes after 5 seconds

#### Scenario: No timeout indicator without timeout

Given the modal has no `timeout` prop
When the modal is open
Then no timeout indicator is visible

---

### Requirement: Conditional Rendering

The modal MUST NOT render when `isOpen` is false.

#### Scenario: Modal not rendered when closed

Given the modal `isOpen` prop is false
When React renders
Then no modal elements are in the DOM

---

### Requirement: Accessibility Attributes

The modal MUST have proper accessibility attributes for screen readers.

#### Scenario: Dialog role and aria attributes

Given the modal is open
When the container renders
Then the container has `role="dialog"`
And the container has `aria-modal="true"`
