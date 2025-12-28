import { memo } from 'react';

import { emptySlotIcons } from './icons';
import type { EmptySlotProps } from './types';

/**
 * Empty slot placeholder component for selection grids.
 * Displays a dashed border with a muted icon and "Leer" text.
 */
export const EmptySlot = memo(function EmptySlot({ icon }: EmptySlotProps) {
  const IconComponent = emptySlotIcons[icon];

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
