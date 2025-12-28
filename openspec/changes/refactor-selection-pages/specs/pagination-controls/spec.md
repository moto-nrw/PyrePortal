# Pagination Controls

Reusable component for pagination navigation UI.

## ADDED Requirements

### Requirement: Three-Column Layout

The `PaginationControls` component SHALL render a three-column grid layout.

#### Scenario: Layout structure

- **WHEN** `PaginationControls` is rendered
- **THEN** the layout uses CSS Grid with `gridTemplateColumns: '1fr auto 1fr'`
- **AND** the previous button is left-aligned
- **AND** the page indicator is centered
- **AND** the next button is right-aligned

### Requirement: Previous Button

The component SHALL render a previous page button with German label.

#### Scenario: Previous button appearance

- **WHEN** `PaginationControls` is rendered
- **THEN** a button with text "← Vorherige" is displayed
- **AND** the chevron-left icon appears before the text

#### Scenario: Previous button enabled state

- **WHEN** `canGoPrev` is `true`
- **THEN** the button has color `#3B82F6` (blue)
- **AND** cursor is `pointer`
- **AND** clicking calls `onPrevPage`

#### Scenario: Previous button disabled state

- **WHEN** `canGoPrev` is `false`
- **THEN** the button has color `#9CA3AF` (gray)
- **AND** opacity is 0.5
- **AND** cursor is `not-allowed`
- **AND** clicking has no effect

### Requirement: Next Button

The component SHALL render a next page button with German label.

#### Scenario: Next button appearance

- **WHEN** `PaginationControls` is rendered
- **THEN** a button with text "Nächste →" is displayed
- **AND** the chevron-right icon appears after the text

#### Scenario: Next button enabled state

- **WHEN** `canGoNext` is `true`
- **THEN** the button has color `#3B82F6` (blue)
- **AND** cursor is `pointer`
- **AND** clicking calls `onNextPage`

#### Scenario: Next button disabled state

- **WHEN** `canGoNext` is `false`
- **THEN** the button has color `#9CA3AF` (gray)
- **AND** opacity is 0.5
- **AND** cursor is `not-allowed`
- **AND** clicking has no effect

### Requirement: Page Indicator

The component SHALL display the current page and total pages.

#### Scenario: Page indicator format

- **WHEN** `currentPage` is 1 (0-indexed) and `totalPages` is 3
- **THEN** the indicator displays "Seite 2 von 3" (1-indexed for display)

### Requirement: Button Styling

The pagination buttons SHALL have consistent minimal styling.

#### Scenario: Button base styling

- **WHEN** pagination buttons are rendered
- **THEN** buttons have no background (`transparent`)
- **AND** buttons have no border
- **AND** buttons have no box-shadow
- **AND** font size is 18px
- **AND** font weight is 500
- **AND** `-webkit-tap-highlight-color` is `transparent`
