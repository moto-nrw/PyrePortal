import { memo } from 'react';

import type { EmptySlotProps, IconType } from './types';

/**
 * Empty slot SVG icons (smaller, muted versions).
 */
const emptyIcons: Record<IconType, React.FC> = {
  person: () => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9CA3AF"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  calendar: () => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9CA3AF"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  door: () => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9CA3AF"
      strokeWidth="1.5"
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
 * Empty slot placeholder component for selection grids.
 * Displays a dashed border with a muted icon and "Leer" text.
 */
export const EmptySlot = memo(function EmptySlot({ icon }: EmptySlotProps) {
  const IconComponent = emptyIcons[icon];

  return (
    <div
      style={{
        height: '160px',
        backgroundColor: '#FAFAFA',
        border: '2px dashed #E5E7EB',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          opacity: 0.4,
        }}
      >
        <IconComponent />
        <span
          style={{
            fontSize: '14px',
            color: '#9CA3AF',
            fontWeight: 400,
          }}
        >
          Leer
        </span>
      </div>
    </div>
  );
});
