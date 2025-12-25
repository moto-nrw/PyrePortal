# modal-variants Specification

## Purpose

Semantic modal wrappers (ErrorModal, SuccessModal, InfoModal) that extend ModalBase with preset styling for common use cases.

## NEW Requirements

### Requirement: ModalBase supports size presets

ModalBase SHALL support a `size` prop with presets to match existing modal dimensions.

#### Scenario: ModalBase renders with size="sm"

Given ModalBase is rendered with `size="sm"`
When the component mounts
Then the modal container has max-width 500px
And the modal container has padding 48px
And the modal container has border-radius 20px

#### Scenario: ModalBase renders with default size

Given ModalBase is rendered without a size prop
When the component mounts
Then the modal uses size="lg" for backwards compatibility
And the modal container has max-width 700px

---

### Requirement: ModalBase has default backdrop blur

ModalBase SHALL apply backdrop blur to all modals by default.

#### Scenario: Default backdrop blur applied

Given ModalBase is rendered without a backdropBlur prop
When the modal is open
Then the backdrop has `backdrop-filter: blur(4px)`

#### Scenario: Custom backdrop blur

Given ModalBase has `backdropBlur="8px"`
When the modal is open
Then the backdrop has `backdrop-filter: blur(8px)`

---

### Requirement: ModalBase auto-detects timeout indicator colors

ModalBase SHALL automatically choose timeout indicator colors based on background contrast.

#### Scenario: Light background gets dark indicator

Given ModalBase has `backgroundColor="#FFFFFF"`
When the modal is rendered with a timeout
Then the timeout indicator uses dark colors (rgba(0, 0, 0, 0.3))
And the indicator is visible against the white background

#### Scenario: Colored background gets white indicator

Given ModalBase has `backgroundColor="#83CD2D"` (green)
When the modal is rendered with a timeout
Then the timeout indicator uses white colors (rgba(255, 255, 255, 0.9))
And the indicator is visible against the colored background

#### Scenario: Custom indicator colors override auto-detection

Given ModalBase has `timeoutColor="#FF0000"`
When the modal is rendered with a timeout
Then the timeout indicator uses the custom color
And auto-detection is bypassed

---

## MODIFIED Requirements

### Requirement: ErrorModal uses ModalBase

ErrorModal SHALL use ModalBase as its foundation instead of implementing its own modal shell.

#### Scenario: ErrorModal renders with ModalBase

Given ErrorModal is rendered with `isOpen={true}`
When the component mounts
Then ModalBase is rendered with `size="sm"`
And the native `<dialog>` element is used
And proper accessibility attributes are present
And the timeout indicator is visible (dark on white background)

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
Then ModalBase is rendered with `size="sm"`
And no inline `<style>` tags are present
And the timeout indicator is visible (dark on white background)

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
Then ModalBase is rendered with `size="sm"`
And backdrop blur is applied (from ModalBase default)
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
