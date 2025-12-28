# Design: Selection Page Component System

## Context

PyrePortal has 5 selection pages with nearly identical UI patterns but no shared abstractions. Each page independently implements:

- Pagination state and handlers
- 5×2 grid layout with 14px gaps
- Selectable cards (160px height, 24px border-radius)
- Selection indicator (green checkmark circle)
- Touch feedback (scale 0.98)
- Empty slot placeholders
- Prev/Next pagination controls

This refactoring extracts shared components to reduce cognitive complexity (SonarCloud S3776) and eliminate ~1150 lines of duplication.

## Goals / Non-Goals

**Goals:**

- Reduce cognitive complexity in TeamManagementPage (25→≤10) and StudentSelectionPage (45→≤12)
- Create reusable components for all entity selection UIs
- Standardize visual styling (rgba tints, consistent border-radius)
- Maintain all existing functionality

**Non-Goals:**

- Changing page-level navigation logic
- Modifying data fetching patterns (store actions remain unchanged)
- Adding new features to selection pages
- Changing the 5×2 grid layout or 10 items per page

## Decisions

### Decision 1: Hook + Component Approach (not just hooks)

**Choice:** Create both `usePagination` hook AND `SelectableGrid`/`SelectableCard` components.

**Why:** The JSX for cards is nearly identical across all pages. Extracting only hooks would leave ~200 lines of duplicated JSX per page. Full component extraction maximizes code reuse.

**Alternatives considered:**

- Hooks only: More flexible but leaves JSX duplication
- Single monolithic `SelectionPage` component: Too rigid, pages have different action buttons and navigation

### Decision 2: Icon Type Enum (not render props)

**Choice:** `SelectableCard` accepts `icon: 'person' | 'calendar' | 'door'` enum.

**Why:** Only 3 icon types exist across all pages. An enum is simpler than render props and covers all use cases.

**Alternatives considered:**

- Render prop for icon: Over-engineered for 3 fixed icons
- Icon component prop: Similar complexity, no benefit

### Decision 3: Standardize to RGBA Tint Pattern

**Choice:** All icon backgrounds use `rgba(${color}, 0.15)` pattern.

**Why:** 4 of 5 pages already use this pattern. The 2 outliers (`#DBEAFE`, `#DCFCE7`) are inconsistent.

**Standardized colors:**
| Entity | Icon Color | Background (unselected) |
|--------|------------|------------------------|
| Staff (StaffSelection) | `#e57a00` | `rgba(229,122,0,0.15)` |
| Person (Team, Student) | `#2563EB` | `rgba(37,99,235,0.15)` |
| Activity | `#e02020` | `rgba(224,32,32,0.15)` |
| Room | `#4f46e5` | `rgba(79,70,229,0.15)` |
| Selected (all) | `#16A34A` | `rgba(131,205,45,0.15)` |

### Decision 4: Empty Slot Border Radius Standardization

**Choice:** All empty slots use `20px` border-radius.

**Why:** 4 of 5 pages use `20px`. CreateActivityPage uses `12px` (inconsistent).

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ SelectionPage (e.g., StaffSelectionPage)                    │
│ - Data fetching (store actions)                             │
│ - Navigation (back, continue)                               │
│ - Page-specific logic                                       │
└─────────────────────────────────────────────────────────────┘
         │
         │ uses
         ▼
┌─────────────────────────────────────────────────────────────┐
│ usePagination<T>(items, options)                            │
│ - currentPage, totalPages                                   │
│ - paginatedItems, emptySlotCount                           │
│ - goToNextPage, goToPrevPage, resetPage                    │
│ - canGoNext, canGoPrev                                      │
└─────────────────────────────────────────────────────────────┘
         │
         │ provides data to
         ▼
┌─────────────────────────────────────────────────────────────┐
│ SelectableGrid                                              │
│ - Renders 5×2 grid layout                                   │
│ - Maps items to SelectableCard components                   │
│ - Renders EmptySlot placeholders                            │
└─────────────────────────────────────────────────────────────┘
         │
         │ renders
         ▼
┌─────────────────────────────────────────────────────────────┐
│ SelectableCard                         │ EmptySlot         │
│ - Selection indicator                  │ - Dashed border   │
│ - Icon with color tint                 │ - Muted icon      │
│ - Name + optional badge                │ - "Leer" text     │
│ - Touch feedback                       │                   │
└────────────────────────────────────────┴───────────────────┘
         │
         │ alongside
         ▼
┌─────────────────────────────────────────────────────────────┐
│ PaginationControls                                          │
│ - "← Vorherige" / "Nächste →" buttons                       │
│ - "Seite X von Y" indicator                                 │
│ - Disabled states for first/last page                       │
└─────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

**Risk:** Breaking existing functionality during refactoring.
**Mitigation:** Run `npm run check` after each page refactoring. Manual testing on each page.

**Risk:** Visual regressions from standardization.
**Mitigation:** Changes are intentional standardization. Document expected visual changes (rgba tints replacing solid colors).

**Trade-off:** Slightly less flexibility per page.
**Acceptable because:** All pages follow the same pattern. Future pages benefit from consistency.

## Migration Plan

1. Create new components and hook (no changes to existing pages)
2. Add `entityColors` to designSystem.ts
3. Refactor pages one at a time, validating after each:
   - StaffSelectionPage (simplest, good baseline)
   - TeamManagementPage (SonarCloud target)
   - CreateActivityPage
   - RoomSelectionPage
   - StudentSelectionPage (most complex, last)
4. Run `npm run check` after all changes
5. Verify SonarCloud complexity scores

## Open Questions

None - design validated through brainstorming session.
