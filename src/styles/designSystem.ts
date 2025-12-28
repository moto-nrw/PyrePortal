/**
 * Design System Constants based on UI_DESIGN_SYSTEM_FLO.md
 *
 * This file contains all the style constants from Flo's design system
 * to ensure visual consistency across the application while using inline styles.
 */

export const designSystem = {
  // Border Radius System (matching Tailwind classes from design guide)
  borderRadius: {
    sm: '8px', // rounded-sm - Small elements
    md: '12px', // rounded-md - Buttons, inputs
    lg: '16px', // rounded-lg - Cards
    xl: '24px', // rounded-3xl - Modals, large cards
    '2xl': '32px', // rounded-2xl - Hero sections
    full: '9999px', // rounded-full - Pills, circular elements
  },

  // Shadow System (from design guide)
  shadows: {
    // Base shadows
    soft: '0 8px 30px rgb(0,0,0,0.12)',
    elevated: '0 20px 50px rgb(0,0,0,0.15)',

    // Colored shadows
    green: '0 8px 40px rgb(131,205,45,0.3)',
    blue: '0 8px 40px rgb(80,128,216,0.3)',
    teal: '0 8px 40px rgb(20,184,166,0.3)',

    // Component-specific shadows
    button: '0 4px 14px 0 rgba(0,0,0,0.1)',
    buttonHover: '0 8px 20px 0 rgba(0,0,0,0.15)',
    card: '0 8px 30px rgb(0,0,0,0.12)',
    cardHover: '0 20px 50px rgb(0,0,0,0.15)',
    modal: '0 25px 50px -12px rgba(0,0,0,0.25)',
  },

  // Glassmorphism Effects
  glass: {
    // Backgrounds
    background: 'rgba(255,255,255,0.9)',
    backgroundStrong: 'rgba(255,255,255,0.95)',
    backgroundLight: 'rgba(255,255,255,0.8)',

    // Backdrop filters
    blur: 'blur(20px)',
    blurMedium: 'blur(12px)',
    blurLight: 'blur(8px)',

    // Combined effect helpers
    cardStyle: {
      background: 'rgba(255,255,255,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    },
  },

  // Color System
  colors: {
    // Primary brand colors
    primaryBlue: '#5080D8',
    primaryGreen: '#83CD2D',
    secondaryGreen: '#70B525',

    // Semantic colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Text colors
    textPrimary: '#1F2937',
    textSecondary: '#374151',
    textLight: '#6B7280',
    textMuted: '#9CA3AF',
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
    // Primary gradients
    green: 'linear-gradient(135deg, #83CD2D, #70B525)',
    blue: 'linear-gradient(135deg, #5080D8, #4A70C8)',
    brand: 'linear-gradient(135deg, #5080D8, #83CD2D)',

    // Direction variants
    greenRight: 'linear-gradient(to right, #83CD2D, #70B525)',
    blueRight: 'linear-gradient(to right, #5080D8, #4A70C8)',

    // Background gradients
    light: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)',
    gray: 'linear-gradient(to bottom right, #F9FAFB, #F8FAFC)',

    // Overlay gradients
    blueOverlay: 'linear-gradient(to bottom right, rgba(80,128,216,0.03), rgba(96,165,250,0.03))',
    greenOverlay: 'linear-gradient(to bottom right, rgba(131,205,45,0.03), rgba(112,181,37,0.03))',
  },

  // Background bubble colors used by AnimatedBackground
  bubbleColors: ['#FF8080', '#80D8FF', '#A5D6A7', '#FFA726'],

  // Animation & Transitions
  transitions: {
    // Duration-based
    base: 'all 200ms ease-out',
    smooth: 'all 300ms ease-out',
    complex: 'all 500ms ease-out',

    // Easing functions
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeBounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Transform scales for interactions
  scales: {
    hover: 'scale(1.01)',
    hoverLarge: 'scale(1.02)',
    active: 'scale(0.98)',
    activeSmall: 'scale(0.95)',
  },

  // Component-specific styles
  components: {
    // Activity/User cards
    card: {
      borderRadius: '24px',
      padding: '16px',
      background: 'rgba(255,255,255,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(229,231,235,0.5)',
      boxShadow: '0 8px 30px rgb(0,0,0,0.12)',
      transition: 'all 500ms ease-out',
    },

    // Primary action button
    buttonPrimary: {
      background: 'linear-gradient(to right, #83CD2D, #70B525)',
      color: '#FFFFFF',
      borderRadius: '9999px',
      padding: '10px 20px',
      fontSize: '16px',
      fontWeight: '600',
      border: 'none',
      boxShadow: '0 4px 14px 0 rgba(131,205,45,0.4)',
      transition: 'all 300ms ease-out',
      cursor: 'pointer',
    },

    // Back button style
    backButton: {
      height: '68px',
      padding: '0 32px',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      borderRadius: '34px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      transition: 'all 200ms ease-out',
    },
  },

  // Spacing (supplementing existing theme)
  spacing: {
    cardGap: '14px',
    sectionGap: '48px',
    modalPadding: '24px',
  },
};

// Helper function to apply glassmorphism effect
export const applyGlassmorphism = (opacity = 0.9, blurAmount = 20) => ({
  background: `rgba(255,255,255,${opacity})`,
  backdropFilter: `blur(${blurAmount}px)`,
  WebkitBackdropFilter: `blur(${blurAmount}px)`,
});

// Helper function for card hover state
export const cardHoverState = {
  transform: designSystem.scales.hover,
  boxShadow: designSystem.shadows.cardHover,
  backgroundColor: '#FFFFFF',
};

// Helper function for button active state
export const buttonActiveState = {
  transform: designSystem.scales.active,
  boxShadow: designSystem.shadows.button,
};

export default designSystem;
