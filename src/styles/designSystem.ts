/**
 * Design System Constants based on UI_DESIGN_SYSTEM_FLO.md
 *
 * This file contains all the style constants from Flo's design system
 * to ensure visual consistency across the application while using inline styles.
 */

export const designSystem = {
  // Border Radius System (matching Tailwind classes from design guide)
  borderRadius: {
    md: '12px', // rounded-md - Buttons, inputs
    lg: '16px', // rounded-lg - Cards
    xl: '24px', // rounded-3xl - Modals, large cards
    full: '9999px', // rounded-full - Pills, circular elements
  },

  // Shadow System (from design guide)
  shadows: {
    // Colored shadows
    green: '0 8px 40px rgb(131,205,45,0.3)',
    blue: '0 8px 40px rgb(80,128,216,0.3)',

    // Component-specific shadows
    button: '0 4px 14px 0 rgba(0,0,0,0.1)',
  },

  // Glassmorphism Effects
  glass: {
    background: 'rgba(255,255,255,0.9)',
    blur: 'blur(20px)',
  },

  // Color System
  colors: {
    // Primary brand colors
    primaryGreen: '#83CD2D',

    // Semantic colors
    info: '#3B82F6',

    // Text colors
    textDark: '#111827',
    textSecondary: '#374151',
    textMuted: '#9CA3AF',

    // Border colors
    border: '#E5E7EB',

    // Background colors
    white: '#FFFFFF',

    // Legacy text colors migrated from theme.ts (keep exact rendered values
    // in ErrorModal, SuccessModal and TagAssignmentPage)
    textStrong: '#0f0f0f',
    textSubtle: '#4a4a4a',
  },

  /**
   * Entity-specific colors for SelectableCard icons.
   * Each entity type has an icon color and a background tint (15% opacity).
   */
  entityColors: {
    /** Staff/Supervisor selection - orange theme */
    staff: {
      icon: '#e57a00',
      background: 'rgba(229,122,0,0.15)',
    },
    /** Person/Team/Student selection - blue theme */
    person: {
      icon: '#2563EB',
      background: 'rgba(37,99,235,0.15)',
    },
    /** Activity selection - red theme */
    activity: {
      icon: '#e02020',
      background: 'rgba(224,32,32,0.15)',
    },
    /** Room selection - indigo theme */
    room: {
      icon: '#4f46e5',
      background: 'rgba(79,70,229,0.15)',
    },
    /** Selected state (all entities) - green theme */
    selected: {
      icon: '#16A34A',
      background: 'rgba(131,205,45,0.15)',
    },
    /** Disabled/Occupied state - gray theme */
    disabled: {
      icon: '#9CA3AF',
      background: '#F3F4F6',
    },
  },

  // Gradient Definitions
  gradients: {
    greenRight: 'linear-gradient(to right, #83CD2D, #70B525)',
    blueRight: 'linear-gradient(to right, #5080D8, #4A70C8)',
  },

  // Background bubble colors used by AnimatedBackground
  bubbleColors: ['#FF8080', '#80D8FF', '#A5D6A7', '#FFA726'],

  // Animation & Transitions
  transitions: {
    base: 'all 200ms ease-out',

    // Legacy transition migrated from theme.ts (LandingPage logo)
    slow: 'all 0.75s',
  },

  // Transform scales for interactions
  scales: {
    active: 'scale(0.98)',
    activeSmall: 'scale(0.95)',
  },

  // Spacing (legacy scale migrated from theme.ts)
  spacing: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },

  // Typography tokens migrated from theme.ts
  fonts: {
    size: {
      large: '1.3em',
      xl: '1.5rem',
    },
    weight: {
      bold: '700',
    },
  },
};
