# Selectable Grid

Reusable component system for entity selection grids with cards.

## ADDED Requirements

### Requirement: Grid Layout

The `SelectableGrid` component SHALL render a 5-column grid layout.

#### Scenario: Grid structure

- **WHEN** `SelectableGrid` is rendered
- **THEN** the layout uses CSS Grid with `gridTemplateColumns: 'repeat(5, 1fr)'`
- **AND** gap is `14px`
- **AND** `alignContent` is `start`

### Requirement: Card Rendering

The grid SHALL render a `SelectableCard` for each item.

#### Scenario: Cards rendered from items

- **WHEN** `SelectableGrid` receives 7 items
- **THEN** 7 `SelectableCard` components are rendered
- **AND** each card receives the item's `id`, `name`, and `badge` props

### Requirement: Empty Slot Filling

The grid SHALL render `EmptySlot` components to complete partial rows.

#### Scenario: Empty slots fill grid

- **WHEN** `SelectableGrid` receives 7 items and `emptySlotCount` is 3
- **THEN** 3 `EmptySlot` components are rendered after the cards
- **AND** the grid displays a complete 2-row layout (10 cells total)

### Requirement: Selection State

The grid SHALL track which items are selected via a `Set` of IDs.

#### Scenario: Single item selected

- **WHEN** `selectedIds` contains ID `5`
- **THEN** the card with ID `5` renders with `isSelected={true}`
- **AND** all other cards render with `isSelected={false}`

#### Scenario: Multiple items selected

- **WHEN** `selectedIds` contains IDs `5` and `8`
- **THEN** cards with IDs `5` and `8` render with `isSelected={true}`

### Requirement: Card Dimensions

The `SelectableCard` component SHALL have fixed dimensions.

#### Scenario: Card size

- **WHEN** `SelectableCard` is rendered
- **THEN** width is `100%` (fills grid cell)
- **AND** height is `160px`
- **AND** border-radius is `24px`

### Requirement: Card Selection Indicator

Selected cards SHALL display a green checkmark indicator.

#### Scenario: Unselected card indicator

- **WHEN** `isSelected` is `false`
- **THEN** a 24px circle with background `#E5E7EB` is positioned at top-right
- **AND** no checkmark icon is displayed

#### Scenario: Selected card indicator

- **WHEN** `isSelected` is `true`
- **THEN** a 24px circle with background `#83CD2D` (primaryGreen) is positioned at top-right
- **AND** a white checkmark SVG icon is displayed inside

### Requirement: Card Border Styling

Cards SHALL have distinct borders for selected/unselected states.

#### Scenario: Unselected card border

- **WHEN** `isSelected` is `false`
- **THEN** border is `2px solid #E5E7EB`

#### Scenario: Selected card border

- **WHEN** `isSelected` is `true`
- **THEN** border is `3px solid #83CD2D`
- **AND** box-shadow is `0 8px 30px rgba(131, 205, 45, 0.2)`

### Requirement: Card Icon Display

Cards SHALL display an icon with color-tinted background.

#### Scenario: Icon background unselected

- **WHEN** `isSelected` is `false` and `iconColor` is `#e57a00`
- **THEN** icon background is `rgba(229, 122, 0, 0.15)`

#### Scenario: Icon background selected

- **WHEN** `isSelected` is `true`
- **THEN** icon background is `rgba(131, 205, 45, 0.15)` (green tint)

#### Scenario: Icon stroke color unselected

- **WHEN** `isSelected` is `false` and `iconColor` is `#e57a00`
- **THEN** icon stroke color is `#e57a00`

#### Scenario: Icon stroke color selected

- **WHEN** `isSelected` is `true`
- **THEN** icon stroke color is `#16A34A` (green)

### Requirement: Icon Types

The card SHALL support three icon types: person, calendar, door.

#### Scenario: Person icon

- **WHEN** `icon` is `'person'`
- **THEN** an SVG with user silhouette path is displayed

#### Scenario: Calendar icon

- **WHEN** `icon` is `'calendar'`
- **THEN** an SVG with calendar/date path is displayed

#### Scenario: Door icon

- **WHEN** `icon` is `'door'`
- **THEN** an SVG with door/room path is displayed

### Requirement: Card Name Display

Cards SHALL display the entity name.

#### Scenario: Name styling

- **WHEN** `SelectableCard` is rendered with `name="Max Mustermann"`
- **THEN** the name is displayed centered
- **AND** font size is `18px`
- **AND** font weight is `700`
- **AND** color is `#111827`

### Requirement: Optional Badge Display

Cards SHALL optionally display a badge below the name.

#### Scenario: Badge displayed

- **WHEN** `SelectableCard` receives `badge="3a"`
- **THEN** a pill badge with text "3a" is displayed below the name
- **AND** badge has `12px` border-radius
- **AND** badge has padding `4px 12px`

#### Scenario: No badge

- **WHEN** `SelectableCard` does not receive a `badge` prop
- **THEN** no badge element is rendered

#### Scenario: Badge color

- **WHEN** `badge` is provided and `badgeColor` is `#3B82F6`
- **THEN** badge background is `#3B82F6`
- **AND** badge text color is white

### Requirement: Touch Feedback

Cards SHALL provide visual feedback on touch.

#### Scenario: Touch start

- **WHEN** user touches a card
- **THEN** card transforms to `scale(0.98)`

#### Scenario: Touch end

- **WHEN** user releases touch
- **THEN** card transforms back to `scale(1)` after 50ms

### Requirement: Disabled State

Cards SHALL support a disabled state for unavailable items.

#### Scenario: Disabled card appearance

- **WHEN** `disabled` is `true`
- **THEN** card opacity is `0.6`
- **AND** cursor is `not-allowed`
- **AND** no selection indicator is shown

#### Scenario: Disabled card interaction

- **WHEN** user clicks a disabled card
- **THEN** `onSelect` is not called

### Requirement: Empty Slot Styling

The `EmptySlot` component SHALL display a placeholder cell.

#### Scenario: Empty slot appearance

- **WHEN** `EmptySlot` is rendered
- **THEN** height is `160px`
- **AND** background is `#FAFAFA`
- **AND** border is `2px dashed #E5E7EB`
- **AND** border-radius is `20px`

#### Scenario: Empty slot content

- **WHEN** `EmptySlot` is rendered
- **THEN** a muted icon matching the grid's icon type is displayed
- **AND** text "Leer" is displayed below the icon
- **AND** content opacity is `0.4`
