import { memo } from 'react';

import { designSystem } from '../../../styles/designSystem';

import { cardIcons } from './icons';
import type { SelectableCardProps, EntityColorType } from './types';

/**
 * Get the icon and background colors based on selection and entity type.
 */
function getColors(
  colorType: EntityColorType,
  isSelected: boolean,
  isDisabled: boolean
): { iconColor: string; backgroundColor: string } {
  if (isDisabled) {
    return {
      iconColor: designSystem.entityColors.disabled.icon,
      backgroundColor: designSystem.entityColors.disabled.background,
    };
  }

  if (isSelected) {
    return {
      iconColor: designSystem.colors.primaryGreen,
      backgroundColor: designSystem.entityColors.selected.background,
    };
  }

  const entityColor = designSystem.entityColors[colorType];
  return {
    iconColor: entityColor.icon,
    backgroundColor: entityColor.background,
  };
}

/**
 * Selectable card component for entity selection grids.
 * Displays an icon, name, optional badge, and selection indicator.
 */
export const SelectableCard = memo(function SelectableCard({
  name,
  icon,
  colorType,
  isSelected,
  isDisabled = false,
  badge,
  badgeColor = 'green',
  onClick,
}: SelectableCardProps) {
  const { iconColor, backgroundColor } = getColors(colorType, isSelected, isDisabled);
  const IconComponent = cardIcons[icon];

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isDisabled) {
      e.currentTarget.style.transform = 'scale(0.98)';
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isDisabled) {
      setTimeout(() => {
        if (e.currentTarget) {
          e.currentTarget.style.transform = 'scale(1)';
        }
      }, 50);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        width: '100%',
        height: '160px',
        backgroundColor: designSystem.colors.white,
        border: isSelected
          ? `3px solid ${designSystem.colors.primaryGreen}`
          : `2px solid ${designSystem.colors.border}`,
        borderRadius: designSystem.borderRadius.xl,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: badge ? '12px' : '16px',
        position: 'relative',
        transition: 'all 150ms ease-out',
        boxShadow: isSelected
          ? '0 8px 30px rgba(131, 205, 45, 0.2)'
          : '0 4px 12px rgba(0, 0, 0, 0.08)',
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      {/* Selection indicator */}
      {!isDisabled && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: isSelected
              ? designSystem.colors.primaryGreen
              : designSystem.colors.border,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 200ms',
          }}
        >
          {isSelected && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={designSystem.colors.white}
              strokeWidth="3"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </div>
      )}

      {/* Icon container */}
      <div
        style={{
          width: '64px',
          height: '64px',
          backgroundColor,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
        }}
      >
        <IconComponent size={icon === 'person' ? 36 : 48} />
      </div>

      {/* Name */}
      <span
        style={{
          fontSize: '18px',
          fontWeight: 700,
          lineHeight: '1.2',
          maxWidth: '100%',
          wordBreak: 'break-word',
          textAlign: 'center',
          color: designSystem.colors.textDark,
        }}
      >
        {name}
      </span>

      {/* Optional badge */}
      {badge && (
        <span
          style={{
            fontSize: '12px',
            padding: '4px 12px',
            borderRadius: designSystem.borderRadius.md,
            backgroundColor:
              badgeColor === 'blue' ? designSystem.colors.info : designSystem.colors.primaryGreen,
            color: designSystem.colors.white,
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
});
