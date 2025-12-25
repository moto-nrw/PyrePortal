# modal-variants Specification

## Purpose

Semantic modal wrappers (ErrorModal, SuccessModal, InfoModal) that extend ModalBase with preset styling for common use cases.

## MODIFIED Requirements

### Requirement: ErrorModal uses ModalBase

ErrorModal SHALL use ModalBase as its foundation instead of implementing its own modal shell.

#### Scenario: ErrorModal renders with ModalBase

Given ErrorModal is rendered with `isOpen={true}`
When the component mounts
Then ModalBase is rendered as the container
And the native `<dialog>` element is used
And proper accessibility attributes are present

#### Scenario: ErrorModal auto-closes

Given ErrorModal has `autoCloseDelay={3000}`
When 3 seconds elapse
Then the modal closes automatically
And a timeout indicator is visible during the countdown

---

### Requirement: SuccessModal uses ModalBase

SuccessModal SHALL use ModalBase as its foundation.

#### Scenario: SuccessModal renders with ModalBase

Given SuccessModal is rendered with `isOpen={true}`
When the component mounts
Then ModalBase is rendered as the container
And no inline `<style>` tags are present

#### Scenario: SuccessModal auto-closes

Given SuccessModal has `autoCloseDelay={3000}`
When 3 seconds elapse
Then the modal closes automatically

---

### Requirement: InfoModal uses ModalBase

InfoModal SHALL use ModalBase as its foundation.

#### Scenario: InfoModal renders with ModalBase

Given InfoModal is rendered with `isOpen={true}`
When the component mounts
Then ModalBase is rendered as the container
And no inline `<style>` tags are present
And no manual keyboard event handlers are present (ModalBase handles ESC)

#### Scenario: InfoModal displays custom title

Given InfoModal has `title="Hinweis"`
When the modal is open
Then the title "Hinweis" is displayed

---

## REMOVED Requirements

### Requirement: ModalTimeoutIndicator public export

ModalTimeoutIndicator is no longer exported from the public API.

#### Scenario: ModalTimeoutIndicator not exported from index

Given a developer imports from `@/components/ui`
When they attempt to import `ModalTimeoutIndicator`
Then the import fails
And they should use ModalBase with `timeout` prop instead

#### Scenario: ModalTimeoutIndicator still exists internally

Given ModalBase needs a timeout indicator
When ModalBase renders with `timeout` prop
Then ModalTimeoutIndicator is used internally
And the file `src/components/ui/ModalTimeoutIndicator.tsx` exists
