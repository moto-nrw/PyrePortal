# Pagination Hook

Generic React hook for managing paginated lists.

## ADDED Requirements

### Requirement: Generic Pagination State

The `usePagination<T>` hook SHALL manage pagination state for any array of items.

#### Scenario: Hook returns paginated items

- **WHEN** `usePagination` is called with an array of 25 items and `itemsPerPage: 10`
- **THEN** `paginatedItems` contains the first 10 items
- **AND** `totalPages` equals 3
- **AND** `currentPage` equals 0

#### Scenario: Hook handles empty array

- **WHEN** `usePagination` is called with an empty array
- **THEN** `paginatedItems` is an empty array
- **AND** `totalPages` equals 1
- **AND** `emptySlotCount` equals 10

### Requirement: Page Navigation

The hook SHALL provide functions to navigate between pages.

#### Scenario: Navigate to next page

- **WHEN** `goToNextPage` is called and `currentPage` is less than `totalPages - 1`
- **THEN** `currentPage` increments by 1
- **AND** `paginatedItems` updates to show the next page of items

#### Scenario: Navigate to previous page

- **WHEN** `goToPrevPage` is called and `currentPage` is greater than 0
- **THEN** `currentPage` decrements by 1
- **AND** `paginatedItems` updates to show the previous page of items

#### Scenario: Cannot navigate past boundaries

- **WHEN** `goToNextPage` is called on the last page
- **THEN** `currentPage` remains unchanged

#### Scenario: Reset page

- **WHEN** `resetPage` is called
- **THEN** `currentPage` is set to 0

### Requirement: Navigation State Flags

The hook SHALL expose boolean flags for navigation button states.

#### Scenario: Can go next when not on last page

- **WHEN** `currentPage` is less than `totalPages - 1`
- **THEN** `canGoNext` is `true`

#### Scenario: Cannot go next on last page

- **WHEN** `currentPage` equals `totalPages - 1`
- **THEN** `canGoNext` is `false`

#### Scenario: Can go prev when not on first page

- **WHEN** `currentPage` is greater than 0
- **THEN** `canGoPrev` is `true`

#### Scenario: Cannot go prev on first page

- **WHEN** `currentPage` equals 0
- **THEN** `canGoPrev` is `false`

### Requirement: Empty Slot Calculation

The hook SHALL calculate the number of empty slots needed to fill a complete grid.

#### Scenario: Full page has no empty slots

- **WHEN** `paginatedItems.length` equals `itemsPerPage`
- **THEN** `emptySlotCount` equals 0

#### Scenario: Partial page has empty slots

- **WHEN** `paginatedItems.length` is 7 and `itemsPerPage` is 10
- **THEN** `emptySlotCount` equals 3

### Requirement: Default Items Per Page

The hook SHALL default to 10 items per page when not specified.

#### Scenario: Default pagination

- **WHEN** `usePagination` is called without `itemsPerPage` option
- **THEN** pages contain at most 10 items each
