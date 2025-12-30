import { memo } from 'react';

import { EmptySlot } from './EmptySlot';
import type { SelectableGridProps } from './types';

/**
 * Generic grid component for entity selection pages.
 * Renders a 5×2 grid with items and empty slot placeholders.
 *
 * @example
 * ```tsx
 * <SelectableGrid
 *   items={paginatedUsers}
 *   renderItem={(user) => (
 *     <SelectableCard
 *       key={user.id}
 *       name={user.name}
 *       icon="person"
 *       colorType="staff"
 *       isSelected={isSelected(user.id)}
 *       onClick={() => handleToggle(user)}
 *     />
 *   )}
 *   emptySlotCount={emptySlotCount}
 *   emptySlotIcon="person"
 * />
 * ```
 */
function SelectableGridComponent<T>(props: Readonly<SelectableGridProps<T>>) {
  const { items, renderItem, emptySlotCount, emptySlotIcon, keyPrefix = 'grid' } = props;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '14px',
        marginTop: '24px',
        marginBottom: '0px',
        alignContent: 'start',
      }}
    >
      {items.map((item, index) => renderItem(item, index))}

      {emptySlotCount > 0 &&
        Array.from({ length: emptySlotCount }).map((_, index) => (
          <EmptySlot key={`${keyPrefix}-empty-${index}`} icon={emptySlotIcon} index={index} />
        ))}
    </div>
  );
}

// Memoize with type assertion to preserve generic type
export const SelectableGrid = memo(SelectableGridComponent) as typeof SelectableGridComponent;
