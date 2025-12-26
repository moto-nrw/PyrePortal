# pill-button Specification

## Purpose

Defines the base PillButton component that provides consistent 68px touch-optimized buttons with variant-based styling for the PyrePortal kiosk application.

## ADDED Requirements

### Requirement: Fixed 68px Height

The PillButton SHALL have a fixed height of 68px regardless of variant or content.

#### Scenario: Button renders with standard height

Given a PillButton with any variant
When the button renders
Then the button has `height: 68px`
And the button has `border-radius: 34px` (pill shape)

#### Scenario: Button height unchanged with icon

Given a PillButton with an icon prop
When the button renders
Then the button height remains 68px
And the icon and text are vertically centered

---

### Requirement: Primary Variant Styling

The PillButton with `variant="primary"` SHALL display green gradient styling for confirmation actions.

#### Scenario: Primary button default appearance

Given a PillButton with `variant="primary"`
When the button renders
Then the button has `background: designSystem.gradients.greenRight`
And the button has `color: #FFFFFF`
And the button has `font-size: 26px`
And the button has `padding: 0 52px`
And the button has `box-shadow: designSystem.shadows.green`
And the button has no border

#### Scenario: Primary button touch feedback

Given a PillButton with `variant="primary"`
When the user touches the button
Then the button transforms to `scale(0.95)`
And the box-shadow changes to `designSystem.shadows.button`

#### Scenario: Primary button touch release

Given a PillButton with `variant="primary"` is being touched
When the user releases the touch
Then the button transforms back to `scale(1)` after 150ms
And the box-shadow returns to `designSystem.shadows.green`

---

### Requirement: Action Variant Styling

The PillButton with `variant="action"` SHALL display blue gradient styling for action-initiating buttons.

#### Scenario: Action button default appearance

Given a PillButton with `variant="action"`
When the button renders
Then the button has `background: designSystem.gradients.blueRight`
And the button has `color: #FFFFFF`
And the button has `font-size: 26px`
And the button has `padding: 0 52px`
And the button has `box-shadow: designSystem.shadows.blue`
And the button has no border

#### Scenario: Action button touch feedback

Given a PillButton with `variant="action"`
When the user touches the button
Then the button transforms to `scale(0.95)`
And the box-shadow changes to `designSystem.shadows.button`

#### Scenario: Action button touch release

Given a PillButton with `variant="action"` is being touched
When the user releases the touch
Then the button transforms back to `scale(1)` after 150ms
And the box-shadow returns to `designSystem.shadows.blue`

---

### Requirement: Secondary Variant Styling

The PillButton with `variant="secondary"` SHALL display glassmorphism styling for navigation actions.

#### Scenario: Secondary button default appearance

Given a PillButton with `variant="secondary"`
When the button renders
Then the button has `background: designSystem.glass.background`
And the button has `backdrop-filter: blur(20px)`
And the button has `font-size: 20px`
And the button has `padding: 0 32px`
And the button has `box-shadow: designSystem.shadows.button`
And the button has a 1px border with color based on `color` prop

#### Scenario: Secondary button with gray color (default)

Given a PillButton with `variant="secondary"` and no color prop
When the button renders
Then the text color is `#374151`
And the border color is `rgba(0,0,0,0.1)`

#### Scenario: Secondary button with blue color

Given a PillButton with `variant="secondary"` and `color="blue"`
When the button renders
Then the text color is `#5080D8`
And the border color is `rgba(80,128,216,0.2)`

#### Scenario: Secondary button touch feedback

Given a PillButton with `variant="secondary"`
When the user touches the button
Then the button transforms to `scale(0.95)`
And the background changes to `#F9FAFB`

---

### Requirement: Icon Support

The PillButton SHALL support optional icon display.

#### Scenario: Button with left-positioned icon (default)

Given a PillButton with `icon={<SomeIcon />}`
When the button renders
Then the icon appears to the left of the text
And there is 12px gap between icon and text

#### Scenario: Button with right-positioned icon

Given a PillButton with `icon={<SomeIcon />}` and `iconPosition="right"`
When the button renders
Then the icon appears to the right of the text
And there is 12px gap between text and icon

#### Scenario: Button without icon

Given a PillButton without an icon prop
When the button renders
Then only the text content is displayed
And the text is centered horizontally

---

### Requirement: Disabled State

The PillButton SHALL support a disabled state that prevents interaction.

#### Scenario: Disabled button appearance

Given a PillButton with `disabled={true}`
When the button renders
Then the button has `opacity: 0.6`
And the button has `cursor: not-allowed`
And the button has no box-shadow

#### Scenario: Disabled primary button background

Given a PillButton with `variant="primary"` and `disabled={true}`
When the button renders
Then the button has `background: linear-gradient(to right, #9CA3AF, #9CA3AF)`

#### Scenario: Disabled action button background

Given a PillButton with `variant="action"` and `disabled={true}`
When the button renders
Then the button has `background: linear-gradient(to right, #9CA3AF, #9CA3AF)`

#### Scenario: Disabled button ignores touch

Given a PillButton with `disabled={true}`
When the user touches the button
Then no visual feedback occurs
And the onClick handler is not called

---

### Requirement: Accessibility

The PillButton SHALL have proper accessibility attributes.

#### Scenario: Button type attribute

Given any PillButton
When the button renders
Then the button has `type="button"`

#### Scenario: Aria label from prop

Given a PillButton with `ariaLabel="Go back"`
When the button renders
Then the button has `aria-label="Go back"`

#### Scenario: Aria label fallback to children

Given a PillButton with `children="Zurück"` and no ariaLabel prop
When the button renders
Then the button has `aria-label="Zurück"` (if children is a string)

#### Scenario: Disabled aria state

Given a PillButton with `disabled={true}`
When the button renders
Then the button has `aria-disabled="true"`

---

### Requirement: Touch Optimization

The PillButton SHALL be optimized for touch interactions on kiosk devices.

#### Scenario: No tap highlight

Given any PillButton
When the button renders
Then the button has `-webkit-tap-highlight-color: transparent`

#### Scenario: Touch cancel handling

Given a PillButton is being touched
When the touch is cancelled (e.g., system interruption)
Then the button resets to default visual state

#### Scenario: Smooth transitions

Given any PillButton
When any visual property changes
Then the change animates with `transition: all 200ms ease-out`

#### Scenario: Unified scale feedback

Given any PillButton variant
When the user touches the button
Then the button scales to 0.95 (designSystem.scales.activeSmall)
