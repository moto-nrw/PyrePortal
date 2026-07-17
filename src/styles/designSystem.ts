/**
 * Design System Constants based on UI_DESIGN_SYSTEM_FLO.md
 *
 * This file contains all the style constants from Flo's design system
 * to ensure visual consistency across the application while using inline styles.
 */

export const designSystem = {
  // Border Radius System (matching Tailwind classes from design guide)
  borderRadius: {
    sm: '8px', // rounded-md (phoenix) - small chrome, dense controls
    md: '12px', // rounded-lg (phoenix) - Buttons, inputs
    lg: '16px', // Cards (legacy PyrePortal)
    xl: '24px', // rounded-2xl (phoenix) - Modals, cards, panels
    full: '9999px', // rounded-full - Pills, circular elements
  },

  // Shadow System (phoenix flat surfaces)
  shadows: {
    // Legacy colored glows (DEPRECATED - kept until pages migrate off gradient buttons)
    green: '0 8px 40px rgb(131,205,45,0.3)',
    blue: '0 8px 40px rgb(80,128,216,0.3)',

    // Component-specific shadows
    button: '0 4px 14px 0 rgba(0,0,0,0.1)',

    // Phoenix flat shadows
    sm: '0 2px 4px rgba(0,0,0,0.1)', // surface / content-surface (shadow-sm)
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', // raised button
    hoverElevate: '0 3px 10px rgba(15,23,42,0.045), 0 0 0 1px rgba(15,23,42,0.045)',
    modal: '0 25px 50px -12px rgba(0,0,0,0.25), 0 8px 16px -8px rgba(80,128,216,0.15)',
  },

  // Glassmorphism Effects (blur retained for modal chrome; glass surfaces deprecated for flat)
  glass: {
    background: 'rgba(255,255,255,0.9)',
    blur: 'blur(20px)',
  },

  // Neutral gray scale (Tailwind grays, phoenix canonical)
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Brand shades (phoenix location-helper + globals.css)
  brand: {
    // Green (success / confirm semantics + status badges) - ALWAYS uppercase #83CD2D
    green: '#83CD2D',
    greenHover: '#74B827',
    greenActive: '#669F21',
    greenText: '#4A7A15', // accessible green text on white
    greenTintGhostHover: '#F0F9E4',
    greenTintGhostActive: '#E4F3D3',
    greenPillBg: 'rgba(131,205,45,0.15)',
    // Blue (secondary action)
    blue: '#5080D8',
    blueHover: '#4A70C8',
    // Red (danger / home)
    red: '#FF3130',
    redPillBg: 'rgba(255,49,48,0.15)',
    // Primary interactive accent is gray-900, NOT green (Florian's rule)
    primary: '#111827',
    primaryHover: '#1F2937',
  },

  // Status hues (location / attendance semantics)
  status: {
    schoolyard: '#F78C10', // orange
    sick: '#EAB308', // amber
    transit: '#D946EF', // magenta
    excused: '#7C3AED', // purple
    neutral: '#6B7280', // gray
  },

  // Canonical card surface (phoenix moto-content-surface)
  surface: {
    background: '#FFFFFF',
    border: '#E5E7EB',
    borderHover: '#D1D5DB',
    borderRadius: '24px',
    shadow: '0 2px 4px rgba(0,0,0,0.1)',
    blur: 'blur(8px)',
  },

  // Dotted page background (phoenix signature)
  dottedBackground: {
    base: '#F9FAFB',
    image: 'radial-gradient(circle at 1px 1px, rgba(17,24,39,0.12) 1px, transparent 0)',
    size: '14px 14px',
  },

  // Modal chrome (phoenix modal.tsx)
  modal: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)',
    border: '1px solid rgba(229,231,235,0.5)',
    blur: 'blur(20px)',
    shadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 8px 16px -8px rgba(80,128,216,0.15)',
    backdrop: 'rgba(0,0,0,0.4)',
  },

  // Motion easings & durations
  motion: {
    // Modal enter/exit
    enterEasing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    enterDuration: '250ms',
    exitEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    exitDuration: '200ms',
    // General interactive transition
    baseEasing: 'ease-out',
    baseDuration: '200ms',
  },

  // Flat replacements for the deprecated gradient buttons (phoenix palette)
  flat: {
    primary: '#111827', // gray-900 primary CTA
    primaryHover: '#1F2937',
    action: '#5080D8', // blue action
    actionHover: '#4A70C8',
    success: '#83CD2D', // green confirm/success
    successHover: '#74B827',
    successActive: '#669F21',
    danger: '#FF3130',
    dangerHover: '#DC2626',
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
  // DEPRECATED: Florian's design system is flat. Use `flat.*` / `brand.*` instead.
  // Retained until all pages migrate off gradient buttons/chips.
  gradients: {
    greenRight: 'linear-gradient(to right, #83CD2D, #70B525)',
    blueRight: 'linear-gradient(to right, #5080D8, #4A70C8)',
  },

  // Background bubble colors (DEPRECATED: dotted background replaced the bubble canvas)
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
