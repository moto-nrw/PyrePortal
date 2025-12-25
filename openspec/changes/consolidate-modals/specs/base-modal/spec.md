# base-modal Specification (Delta)

## ADDED Requirements

### Requirement: Backdrop Blur Support

The modal SHALL support optional backdrop blur effect.

#### Scenario: Modal with backdrop blur

Given the modal has `backdropBlur="4px"`
When the modal is open
Then the backdrop has `backdrop-filter: blur(4px)`
And the backdrop has `-webkit-backdrop-filter: blur(4px)` for Safari

#### Scenario: Modal without backdrop blur (default)

Given the modal has no `backdropBlur` prop
When the modal is open
Then the backdrop has no blur effect
And the backdrop has `backdrop-filter: none`

#### Scenario: Backdrop blur with different values

Given the modal has `backdropBlur="8px"`
When the modal is open
Then the backdrop has `backdrop-filter: blur(8px)`
