# Design: Unify Pill Button Component

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     PillButton                          │
│  Base component: 68px height, touch feedback,           │
│  designSystem tokens, variants: primary/action/secondary│
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────────┐ ┌──────────┐ ┌───────────────┐
    │ContinueButton│ │(direct)  │ │  BackButton   │
    │  (wrapper)   │ │ action   │ │   (wrapper)   │
    │   primary    │ │ variant  │ │   secondary   │
    └──────────────┘ └──────────┘ └───────────────┘
```

## Component API

### PillButton Props

```typescript
interface PillButtonProps {
  // Content
  children: ReactNode;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right'; // Default: 'left'

  // Variants
  variant: 'primary' | 'action' | 'secondary';
  //        └── green    └── blue   └── glass

  // Color accent (secondary variant only)
  color?: 'blue' | 'gray'; // Default: 'gray'

  // State
  disabled?: boolean;

  // Events
  onClick: () => void;

  // Accessibility
  ariaLabel?: string;
}
```

## Variant Styling

### Three Variants

| Variant       | Background                          | Font Size | Padding | Shadow                        | Use Case                       |
| ------------- | ----------------------------------- | --------- | ------- | ----------------------------- | ------------------------------ |
| **primary**   | `designSystem.gradients.greenRight` | 26px      | 0 52px  | `designSystem.shadows.green`  | Weiter, Speichern, Bestätigen  |
| **action**    | `designSystem.gradients.blueRight`  | 26px      | 0 52px  | `designSystem.shadows.blue`   | Scan starten, Aktion ausführen |
| **secondary** | `designSystem.glass.background`     | 20px      | 0 32px  | `designSystem.shadows.button` | Zurück, Abbrechen, Navigation  |

### Primary Variant (Green)

- Background: `linear-gradient(to right, #83CD2D, #70B525)`
- Text: `#FFFFFF`
- Border: none
- Shadow: `0 8px 40px rgb(131,205,45,0.3)`

### Action Variant (Blue)

- Background: `linear-gradient(to right, #5080D8, #4A70C8)`
- Text: `#FFFFFF`
- Border: none
- Shadow: `0 8px 40px rgb(80,128,216,0.3)`

### Secondary Variant (Glass)

- Background: `rgba(255,255,255,0.9)`
- Text: color-dependent (see below)
- Border: 1px solid, color-dependent
- Shadow: `0 4px 14px 0 rgba(0,0,0,0.1)`
- Backdrop-filter: `blur(20px)`

### Color Modifier (secondary only)

| color  | Text/Icon | Border                 |
| ------ | --------- | ---------------------- |
| `gray` | `#374151` | `rgba(0,0,0,0.1)`      |
| `blue` | `#5080D8` | `rgba(80,128,216,0.2)` |

## Sizing

Fixed height, variant-specific typography and padding:

| Property      | primary/action | secondary | Source                        |
| ------------- | -------------- | --------- | ----------------------------- |
| height        | 68px           | 68px      | Touch-optimized standard      |
| padding       | 0 52px         | 0 32px    | CTA vs navigation distinction |
| border-radius | 34px           | 34px      | Pill shape (height/2)         |
| gap           | 12px           | 12px      | Icon ↔ Text spacing           |
| font-size     | 26px           | 20px      | CTA prominence vs navigation  |
| font-weight   | 600            | 600       | Semi-bold                     |

## Touch Feedback

Consistent across ALL variants - unified scale(0.95):

```
State         Transform       Shadow                       Background
─────────────────────────────────────────────────────────────────────────
default       scale(1)        variant-specific             variant-specific
touching      scale(0.95)     designSystem.shadows.button  subtle darken*
disabled      scale(1)        none                         grayed + opacity 0.6
```

\*For secondary variant, background changes to `#F9FAFB` on touch.

### Implementation Pattern

```typescript
const handleTouchStart = (e: TouchEvent<HTMLButtonElement>) => {
  if (disabled) return;
  e.currentTarget.style.transform = designSystem.scales.activeSmall; // scale(0.95)
  e.currentTarget.style.boxShadow = designSystem.shadows.button;
  if (variant === 'secondary') {
    e.currentTarget.style.backgroundColor = '#F9FAFB';
  }
};

const handleTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
  if (disabled) return;
  const target = e.currentTarget;
  setTimeout(() => {
    target.style.transform = 'scale(1)';
    target.style.boxShadow = variantShadow;
    target.style.backgroundColor = variantBackground;
  }, 150);
};
```

Events handled: `onTouchStart`, `onTouchEnd`, `onTouchCancel`

## File Structure

```
src/components/ui/
├── PillButton/
│   ├── PillButton.tsx        # Base component (~120 lines)
│   ├── PillButton.types.ts   # TypeScript interfaces
│   └── index.ts              # Barrel export
├── BackButton.tsx            # Refactored wrapper (~50 lines with icons)
├── ContinueButton.tsx        # Refactored wrapper (~20 lines)
└── index.ts                  # Updated exports
```

## Migration Strategy

### Phase 1: Create PillButton

Create new component without modifying existing code. Both old and new components coexist.

### Phase 2: Refactor Wrappers

Refactor `BackButton` and `ContinueButton` to use `PillButton` internally. External API unchanged - no page modifications needed.

### Phase 3: Standardize Page Buttons

Update inline buttons in pages to use 68px height. Blue gradient buttons (like "Scan starten") can use `<PillButton variant="action">`.

## Trade-offs

### Chosen: Three Variants (primary/action/secondary)

**Pro:** Clear semantic distinction - green=confirm, blue=action, glass=navigate
**Con:** More variants than minimal two

**Rationale:** "Scan starten" uses blue gradient which is semantically different from "Weiter" (green). Having three variants makes intent clear.

### Chosen: Variant-Specific Sizing

**Pro:** CTAs (primary/action) are visually larger and more prominent
**Con:** Less uniformity

**Rationale:** ContinueButton currently uses 26px/52px which works well. Forcing 20px/32px would regress the design. Different button types serve different purposes.

### Chosen: Unified Scale (0.95)

**Pro:** Consistent tactile feedback across all buttons
**Con:** Changes ContinueButton from 0.98 to 0.95

**Rationale:** On Raspberry Pi touchscreen, 0.95 feels more responsive. BackButton already uses this. Unifying improves UX consistency.

### Chosen: No Style Prop

**Pro:** YAGNI - not currently used anywhere
**Con:** Less flexibility

**Rationale:** Checked all ContinueButton usages - none pass style prop. Can add later if needed.

### Chosen: Inline Styles over Tailwind

**Pro:** Consistent with existing `BackButton`/`ContinueButton`, uses `designSystem` tokens
**Con:** Not using project's Tailwind setup

**Rationale:** Existing button components already use inline styles + designSystem. Maintaining consistency is more important than switching styling approach.
