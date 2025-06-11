// Design tokens for consistent styling across the application

export const theme = {
  // Colors
  colors: {
    primary: '#24c8db',
    secondary: '#396cd8',
    success: '#10b981',
    error: '#ef4444',
    text: {
      primary: '#0f0f0f',
      secondary: '#4a4a4a',
      light: '#f6f6f6',
    },
    background: {
      light: '#ffffff',
      dark: '#2f2f2f',
      transparent: 'rgba(255, 255, 255, 0.99)',
      muted: '#f9f9f9',
    },
    border: {
      transparent: 'transparent',
      light: '#e0e0e0',
      hover: '#396cd8',
    },
    hover: {
      light: '#f5f5f5',
      active: '#e8e8e8',
      dark: '#0f0f0f69',
    },
  },

  // Typography
  fonts: {
    family: 'Inter, Avenir, Helvetica, Arial, sans-serif',
    size: {
      small: '0.875rem',
      base: '1em',
      large: '1.3em',
      xl: '1.5rem',
      xxl: '2.8rem',
    },
    weight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
    xxxl: '5rem',
  },

  // Borders
  borders: {
    radius: {
      sm: '8px',
      md: '12px',
      lg: '20px',
    },
    borderRadius: {
      sm: '8px',
      md: '12px',
      lg: '20px',
    },
  },

  // Shadows
  shadows: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.1)',
    md: '0 4px 8px rgba(0, 0, 0, 0.15)',
    lg: '0 6px 12px rgba(0, 0, 0, 0.2)',
  },

  // Animation
  animation: {
    transition: {
      fast: 'all 0.2s',
      normal: 'all 0.3s',
      slow: 'all 0.75s',
    },
  },
};

export default theme;
