# Project Phoenix UI/UX Design System

This document outlines the UI/UX design patterns, animations, and visual standards implemented across the OGS Groups, MyRoom, and Activities features.

## Table of Contents

- [Design Principles](#design-principles)
- [Color System](#color-system)
- [Typography](#typography)
- [Spacing & Layout](#spacing--layout)
- [Components](#components)
- [Animations & Transitions](#animations--transitions)
- [Responsive Design](#responsive-design)

---

## Design Principles

### Core Philosophy

- **Modern Glassmorphism**: Subtle transparency effects with backdrop blur
- **Soft Neumorphism**: Gentle shadows and highlights for depth
- **Micro-interactions**: Smooth transitions that provide feedback
- **Accessibility First**: High contrast ratios, clear focus states
- **Performance**: Hardware-accelerated animations, optimized re-renders

---

## Color System

### Primary Colors

```css
/* Brand Colors */
--primary-blue: #5080d8;
--primary-green: #83cd2d;
--secondary-green: #70b525;

/* Semantic Colors */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;
```

### Gradient Definitions

```css
/* Primary Gradients */
--gradient-green: linear-gradient(135deg, #83cd2d, #70b525);
--gradient-blue: linear-gradient(135deg, #5080d8, #4a70c8);
--gradient-brand: linear-gradient(135deg, #5080d8, #83cd2d);

/* Subtle Background Gradients */
--gradient-light: linear-gradient(
  135deg,
  rgba(255, 255, 255, 0.95) 0%,
  rgba(248, 250, 252, 0.98) 100%
);
--gradient-gray: linear-gradient(to bottom right, from-gray-50/50, to-slate-50/50);
```

### Usage Patterns

- **Primary Actions**: Green gradients (#83CD2D → #70B525)
- **Secondary Actions**: Blue (#5080D8) with hover states
- **Backgrounds**: White with subtle gray gradients
- **Borders**: Gray-200 (default), Blue-200 (active/hover)

---

## Typography

### Font Family

```css
--font-sans: 'Geist Sans', ui-sans-serif, system-ui, sans-serif;
```

### Font Sizes

- **Headings**:
  - Desktop: 1.875rem (30px)
  - Mobile: 1.625rem (26px)
- **Body**: 0.875rem - 1rem (14-16px)
- **Small**: 0.75rem (12px)

### Font Weights

- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

---

## Spacing & Layout

### Border Radius System

```css
/* Consistent Rounding */
--radius-sm: 0.5rem; /* 8px - Small elements */
--radius-md: 0.75rem; /* 12px - Buttons, inputs */
--radius-lg: 1rem; /* 16px - Cards */
--radius-xl: 1.5rem; /* 24px - Modals, large cards */
--radius-2xl: 2rem; /* 32px - Hero sections */
--radius-full: 9999px; /* Pills, circular elements */
```

### Common Patterns

- **Cards**: `rounded-3xl` (1.5rem) with overflow hidden
- **Buttons**: `rounded-lg` to `rounded-full` depending on style
- **Modals**: `rounded-2xl` (1rem) on desktop, `rounded-t-2xl` on mobile
- **Input Fields**: `rounded-lg` (0.5rem)

### Spacing Scale

- Base unit: 0.25rem (4px)
- Common spacings: 2, 3, 4, 6, 8, 12, 16, 20, 24

---

## Components

### Activity Cards

```jsx
className="group cursor-pointer relative overflow-hidden rounded-3xl
           bg-white/90 backdrop-blur-md border border-gray-100/50
           shadow-[0_8px_30px_rgb(0,0,0,0.12)]
           transition-all duration-500
           md:hover:scale-[1.01] md:hover:shadow-[0_20px_50px_rgb(0,0,0,0.15)]
           md:hover:bg-white md:hover:-translate-y-1
           active:scale-[0.99] md:hover:border-blue-200/50"
```

**Key Features**:

- Glassmorphism with `bg-white/90 backdrop-blur-md`
- Smooth scale animation on hover (1.01)
- Elevated shadow on hover
- Border color transition to blue
- Active state feedback

### Buttons

#### Primary Action Button (Green)

```jsx
className="px-5 py-2.5 bg-gradient-to-r from-[#83CD2D] to-[#70B525]
           text-white rounded-full shadow-lg hover:shadow-xl
           transition-all duration-300 active:scale-95"
```

#### Secondary Button (White/Gray)

```jsx
className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700
           rounded-lg border border-gray-200 hover:border-gray-300
           shadow-sm hover:shadow transition-all duration-200"
```

#### Floating Action Button (Mobile)

```jsx
className="fixed bottom-24 right-4 z-40 w-14 h-14
           bg-gradient-to-br from-[#83CD2D] to-[#70B525]
           text-white rounded-full
           shadow-[0_8px_30px_rgb(0,0,0,0.12)]
           hover:shadow-[0_8px_40px_rgb(131,205,45,0.3)]"
```

### Modals

#### Structure

```jsx
// Backdrop
className="fixed inset-0 z-[9999] bg-black/40
           transition-all duration-400 ease-out"

// Modal Container
className="relative w-[calc(100%-2rem)] max-w-md mx-4
           rounded-2xl shadow-2xl border border-gray-200/50
           overflow-hidden transform animate-modalEnter"
```

#### Modal Animations

- **Enter**: Scale from 0.85 → 1, with rotation and blur
- **Exit**: Scale to 0.88, fade out with blur
- **Duration**: 500ms enter, 250ms exit

### Input Fields

```jsx
className="block w-full rounded-lg border-0 px-3 py-2.5
           text-sm text-gray-900 bg-white/80 backdrop-blur-sm
           shadow-sm ring-1 ring-inset ring-gray-200/50
           focus:ring-2 focus:ring-inset focus:ring-[#5080D8]
           transition-all duration-200"
```

---

## Animations & Transitions

### Timing Functions

```css
/* Standard Easings */
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Common Transitions

```css
/* Base Transition */
transition-all duration-200

/* Smooth Interactions */
transition-all duration-300

/* Complex Animations */
transition-all duration-500
```

### Hover Effects

1. **Scale**: `hover:scale-[1.01]` to `hover:scale-[1.02]`
2. **Translation**: `hover:-translate-y-1`
3. **Shadow**: Progressive shadow enhancement
4. **Color**: Border and background color shifts

### Animation Keyframes

#### Modal Enter

```css
@keyframes modalEnter {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(30px) rotate(-1deg);
    filter: blur(3px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0px) rotate(0deg);
  }
}
```

#### Fade In Up

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### Shine Effect

```css
@keyframes shine {
  0% {
    transform: translateX(-100%) rotate(12deg);
  }
  100% {
    transform: translateX(100%) rotate(12deg);
  }
}
```

### Stagger Animations

Activity cards use staggered entrance:

```jsx
style={{
  animationDelay: `${index * 0.05}s`,
  animation: 'fadeInUp 0.5s ease-out forwards',
  opacity: 0
}}
```

---

## Responsive Design

### Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Mobile-First Patterns

#### Touch Targets

- Minimum size: 44x44px
- Spacing between targets: 8px minimum
- Active states: `active:scale-95`

#### Mobile-Specific Styles

```jsx
// Mobile FAB positioning
className = 'md:hidden fixed bottom-24 right-4';

// Mobile modal slides from bottom
className = 'rounded-t-2xl sm:rounded-2xl';

// Touch-friendly padding
className = 'p-4 md:p-6';
```

### Desktop Enhancements

- Hover states only on desktop: `md:hover:`
- Complex animations: Desktop only
- Refined spacing and smaller touch targets

---

## Special Effects

### Glassmorphism

```jsx
className="bg-white/90 backdrop-blur-md"
style={{
  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)',
  backdropFilter: 'blur(20px)'
}}
```

### Inner Glow

```jsx
className="absolute inset-px rounded-3xl
           bg-gradient-to-br from-white/80 to-white/20"
```

### Gradient Borders

```jsx
// Create colored left border for special items
className="absolute left-0 top-3 bottom-3 w-1.5
           bg-gradient-to-b from-green-400 to-green-600
           rounded-r-full"
```

### Shadow Layers

```css
/* Soft shadow */
shadow-[0_8px_30px_rgb(0,0,0,0.12)]

/* Elevated shadow */
shadow-[0_20px_50px_rgb(0,0,0,0.15)]

/* Colored shadow */
shadow-[0_8px_40px_rgb(131,205,45,0.3)]
```

---

## Accessibility Guidelines

### Focus States

- Visible focus rings: `focus:ring-2 focus:ring-[#5080D8]`
- Keyboard navigation support
- Proper ARIA labels

### Color Contrast

- Text on white: Minimum #374151 (gray-700)
- Text on colored backgrounds: White
- Interactive elements: Clear hover/active states

### Motion Preferences

- Respect `prefers-reduced-motion`
- Essential animations only
- Provide alternatives for motion-based feedback

---

## Implementation Examples

### Complete Activity Card

```jsx
<div className="group relative cursor-pointer overflow-hidden rounded-3xl border border-gray-100/50 bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-500 active:scale-[0.99] md:hover:-translate-y-1 md:hover:scale-[1.01] md:hover:border-blue-200/50 md:hover:bg-white md:hover:shadow-[0_20px_50px_rgb(0,0,0,0.15)]">
  {/* Gradient overlay */}
  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 to-cyan-100/80 opacity-[0.03]" />

  {/* Inner glow */}
  <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/80 to-white/20" />

  {/* Content */}
  <div className="relative p-4">{/* Activity content */}</div>
</div>
```

### Interactive Button with Shine

```jsx
<button className="group relative overflow-hidden rounded-full bg-blue-600 px-5 py-2.5 text-white transition-all duration-300 hover:bg-blue-700">
  <span className="relative z-10">Click Me</span>

  {/* Shine effect */}
  <div className="absolute inset-0 -top-2 h-full w-full rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:animate-[shine_1s_ease-in-out] group-hover:opacity-100" />
</button>
```

---

## Best Practices

1. **Performance**

   - Use `transform` and `opacity` for animations
   - Avoid animating `width`, `height`, or `margin`
   - Leverage GPU acceleration with `will-change`

2. **Consistency**

   - Maintain uniform border radius across similar elements
   - Use consistent timing functions
   - Apply shadows systematically

3. **User Experience**

   - Provide immediate feedback (active states)
   - Keep animations under 500ms for responsiveness
   - Ensure touch targets meet minimum size requirements

4. **Maintainability**
   - Use CSS variables for repeated values
   - Create reusable component classes
   - Document custom animations and effects
