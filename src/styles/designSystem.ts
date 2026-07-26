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
    // Component-specific shadows
    button: '0 4px 14px 0 rgba(0,0,0,0.1)',

    // Phoenix flat shadows
    sm: '0 2px 4px rgba(0,0,0,0.1)', // surface / content-surface (shadow-sm)
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', // raised button
    hoverElevate: '0 3px 10px rgba(15,23,42,0.045), 0 0 0 1px rgba(15,23,42,0.045)',
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
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Brand shades (phoenix location-helper + globals.css)
  brand: {
    // Green - unified pastel pair only (design review: no bright #83CD2D accents)
    greenText: '#3F6F12', // accessible green text on white (pastel family accent)
    greenTint: '#EDF8E0', // solid pastel tint (icon circles, pills) per design-review v2
    // Blue (secondary action) - unified on the pastel modal blue accent
    blue: '#3558A8',
    blueHover: '#2A4685',
    blueText: '#3558A8', // accessible dark blue text on white / blue pill tint
    bluePillBg: 'rgba(53, 88, 168, 0.12)',
    // Red (danger / home) - unified on the pastel modal red accent
    red: '#CC2626',
    redPillBg: 'rgba(204, 38, 38, 0.12)',
    // Primary interactive accent is gray-900, NOT green (Florian's rule)
    primary: '#111827',
    primaryHover: '#1F2937',
  },

  /**
   * Pastel modal families (design-review v2, PR #385).
   * Each family is a two-tone pair on a pastel surface:
   * bg = modal surface, tint = icon circle / bar track, accent = icon, heading,
   * body text and bar fill. Values sampled from the approved v2 review state.
   */
  pastel: {
    green: { bg: '#ECF7DF', tint: '#D9EFBE', accent: '#3F6F12' },
    orange: { bg: '#FEEEDB', tint: '#FEDBCA', accent: '#8A5600' },
    red: { bg: '#FFE6E6', tint: '#FFCCCC', accent: '#CC2626' },
    blue: { bg: '#E8EFFA', tint: '#CFDDF4', accent: '#3558A8' },
    purple: { bg: '#EFE7FD', tint: '#DFCEFA', accent: '#6D28D9' },
    amber: { bg: '#FBF4DC', tint: '#F6E7B8', accent: '#92710B' },
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
    shadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 8px 16px -8px rgba(53,88,168,0.15)',
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
    action: '#3558A8', // blue action (pastel modal blue accent)
    actionHover: '#2A4685',
    danger: '#CC2626', // unified modal red (pastel family accent)
    dangerHover: '#B91C1C',
  },

  // Color System
  colors: {
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
   * Design-review v2: unselected entity icons are neutral gray across all
   * entity types; color only marks the selected state (pastel green pair).
   */
  entityColors: {
    /** Staff/Supervisor selection - neutral gray */
    staff: {
      icon: '#6B7280',
      background: '#F3F4F6',
    },
    /** Person/Team/Student selection - neutral gray */
    person: {
      icon: '#6B7280',
      background: '#F3F4F6',
    },
    /** Activity selection - neutral gray */
    activity: {
      icon: '#6B7280',
      background: '#F3F4F6',
    },
    /** Room selection - neutral gray */
    room: {
      icon: '#6B7280',
      background: '#F3F4F6',
    },
    /** Selected state (all entities) - pastel green pair */
    selected: {
      icon: '#3F6F12',
      background: '#EDF8E0',
    },
    /** Disabled/Occupied state - gray theme */
    disabled: {
      icon: '#9CA3AF',
      background: '#F3F4F6',
    },
  },

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
