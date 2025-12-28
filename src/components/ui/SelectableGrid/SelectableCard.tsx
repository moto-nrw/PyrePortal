import { memo } from 'react';

import { designSystem } from '../../../styles/designSystem';

import type { SelectableCardProps, IconType, EntityColorType } from './types';

/**
 * SVG icon components for each icon type.
 */
const icons: Record<IconType, React.FC<{ size?: number }>> = {
  person: ({ size = 36 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  calendar: ({ size = 48 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  door: ({ size = 48 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
      <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
      <circle cx="11" cy="12" r="1" />
    </svg>
  ),
};

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
  const IconComponent = icons[icon];

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
        backgroundColor: '#FFFFFF',
        border: isSelected ? '3px solid #83CD2D' : '2px solid #E5E7EB',
        borderRadius: '24px',
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
            backgroundColor: isSelected ? designSystem.colors.primaryGreen : '#E5E7EB',
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
              stroke="#FFFFFF"
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
          color: '#111827',
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
            borderRadius: '12px',
            backgroundColor: badgeColor === 'blue' ? '#3B82F6' : '#83cd2d',
            color: 'white',
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
});
