import React from 'react';

import theme from '../../styles/theme';

interface ContentBoxProps {
  children: React.ReactNode;
  width?: string;
  height?: string;
  padding?: string;
  rounded?: 'sm' | 'md' | 'lg';
  shadow?: 'sm' | 'md' | 'lg';
  centered?: boolean;
  className?: string;
}

/**
 * ContentBox component - A reusable container with consistent styling
 */
const ContentBox: React.FC<ContentBoxProps> = ({
  children,
  width = '95%',
  height = '90%',
  padding = theme.spacing.xxxl,
  rounded = 'lg',
  shadow = 'md',
  centered = true,
  className = '',
}) => {
  // Map rounded options to border radius values
  const roundedMap = {
    sm: theme.borders.radius.sm,
    md: theme.borders.radius.md,
    lg: theme.borders.radius.lg,
  };

  // Map shadow options to shadow values
  const shadowMap = {
    sm: theme.shadows.sm,
    md: theme.shadows.md,
    lg: theme.shadows.lg,
  };

  // Base styles
  const boxStyles: React.CSSProperties = {
    backgroundColor: theme.colors.background.transparent,
    borderRadius: roundedMap[rounded],
    boxShadow: shadowMap[shadow],
    padding: padding,
    margin: '0 auto',
    width: width,
    height: height,
    position: 'relative',
    zIndex: 1,
    overflow: 'auto',
    display: centered ? 'flex' : 'block',
    flexDirection: centered ? 'column' : undefined,
    justifyContent: centered ? 'center' : undefined,
    alignItems: centered ? 'center' : undefined,
  };

  return (
    <div style={boxStyles} className={`content-box ${className}`}>
      {children}
    </div>
  );
};

export default ContentBox;
