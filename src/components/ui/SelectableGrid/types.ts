import type { ReactNode } from 'react';

/**
 * Icon types available for SelectableCard.
 * Maps to specific SVG icons used in selection pages.
 */
export type IconType = 'person' | 'calendar' | 'door';

/**
 * Entity color themes for cards.
 * Corresponds to entityColors in designSystem.ts.
 */
export type EntityColorType = 'staff' | 'person' | 'activity' | 'room';

/**
 * Props for the SelectableCard component.
 */
export interface SelectableCardProps {
  /** Unique identifier for the card */
  id: string | number;
  /** Display name for the entity */
  name: string;
  /** Icon type to display */
  icon: IconType;
  /** Color theme for the icon (when not selected) */
  colorType: EntityColorType;
  /** Whether this card is currently selected */
  isSelected: boolean;
  /** Whether this card is disabled (e.g., occupied room, active activity) */
  isDisabled?: boolean;
  /** Optional badge text (e.g., class name, capacity) */
  badge?: string;
  /** Badge color variant */
  badgeColor?: 'blue' | 'green';
  /** Click handler */
  onClick: () => void;
}

/**
 * Props for the EmptySlot component.
 */
export interface EmptySlotProps {
  /** Icon type to display in the empty slot */
  icon: IconType;
  /** Unique key prefix for React */
  keyPrefix?: string;
  /** Index for unique key generation */
  index?: number;
}

/**
 * Props for the SelectableGrid component.
 */
export interface SelectableGridProps<T> {
  /** Array of items to display in the grid */
  readonly items: readonly T[];
  /** Render function for each item */
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Number of empty slots to render */
  readonly emptySlotCount: number;
  /** Icon type for empty slots */
  readonly emptySlotIcon: IconType;
  /** Unique key prefix for empty slots */
  readonly keyPrefix?: string;
}

/**
 * Render props pattern for custom card rendering.
 */
export interface CardRenderProps<T> {
  item: T;
  index: number;
  isSelected: boolean;
}
