import React from 'react';

import theme from '../../styles/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

/**
 * Button component with consistent styling
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  children,
  ...props
}) => {
  // Base styles
  const baseStyles = {
    fontFamily: theme.fonts.family,
    fontWeight: theme.fonts.weight.semibold,
    borderRadius: theme.borders.radius.md,
    border: '1px solid transparent',
    boxShadow: theme.shadows.sm,
    cursor: 'pointer',
    transition: theme.animation.transition.fast,
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const, // Type assertion needed for React inline styles
  };

  // Size styles
  const sizeStyles = {
    small: {
      fontSize: theme.fonts.size.small,
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      height: '2.5em',
      minWidth: '120px',
    },
    medium: {
      fontSize: theme.fonts.size.large,
      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
      height: '3em',
      minWidth: '150px',
    },
    large: {
      fontSize: theme.fonts.size.xl,
      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
      height: '3.5em',
      minWidth: '180px',
    },
  };

  // Note: We're using Tailwind classes for variant styling instead of this object
  // This is just kept for reference of the colors and values
  /*
  const variantStyles = {
    primary: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.text.light,
      '&:hover': {
        backgroundColor: '#1eb0c3',
      },
      '&:active': {
        backgroundColor: '#1aa0b1',
      }
    },
    secondary: {
      backgroundColor: theme.colors.background.light,
      color: theme.colors.text.primary,
      '&:hover': {
        backgroundColor: theme.colors.hover.light,
        borderColor: theme.colors.border.hover,
      },
      '&:active': {
        backgroundColor: theme.colors.hover.active,
      }
    },
    outline: {
      backgroundColor: 'transparent',
      color: theme.colors.primary,
      borderColor: theme.colors.primary,
      '&:hover': {
        backgroundColor: 'rgba(36, 200, 219, 0.1)',
      },
      '&:active': {
        backgroundColor: 'rgba(36, 200, 219, 0.2)',
      }
    }
  };
  */

  // Combined styles
  const combinedStyles = {
    ...baseStyles,
    ...sizeStyles[size],
    width: fullWidth ? '100%' : 'auto',
  };

  // Tailwind classes for hover/active states as they're hard to do with inline styles
  const variantClasses = {
    primary: 'bg-[#24c8db] text-white hover:bg-[#1eb0c3] active:bg-[#1aa0b1]',
    secondary:
      'bg-white text-[#0f0f0f] hover:bg-[#f5f5f5] hover:border-[#396cd8] active:bg-[#e8e8e8]',
    outline:
      'bg-transparent text-[#24c8db] border-[#24c8db] hover:bg-[rgba(36,200,219,0.1)] active:bg-[rgba(36,200,219,0.2)]',
  };

  const sizeClasses = {
    small: 'text-sm py-1 px-4 h-[2.5em] min-w-[120px]',
    medium: 'text-[1.3em] py-2 px-6 h-[3em] min-w-[150px]',
    large: 'text-xl py-4 px-8 h-[3.5em] min-w-[180px]',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      style={combinedStyles}
      className={`rounded-[12px] border border-solid transition-all duration-200 ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
