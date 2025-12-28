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
 * Note: React key should be passed at the call site, not as a prop.
 */
export interface SelectableCardProps {
  /** Display name for the entity */
  readonly name: string;
  /** Icon type to display */
  readonly icon: IconType;
  /** Color theme for the icon (when not selected) */
  readonly colorType: EntityColorType;
  /** Whether this card is currently selected */
  readonly isSelected: boolean;
  /** Whether this card is disabled (e.g., occupied room, active activity) */
  readonly isDisabled?: boolean;
  /** Optional badge text (e.g., class name, capacity) */
  readonly badge?: string;
  /** Badge color variant */
  readonly badgeColor?: 'blue' | 'green';
  /** Click handler */
  readonly onClick: () => void;
}

/**
 * Props for the EmptySlot component.
 */
export interface EmptySlotProps {
  /** Icon type to display in the empty slot */
  readonly icon: IconType;
  /** Unique key prefix for React */
  readonly keyPrefix?: string;
  /** Index for unique key generation */
  readonly index?: number;
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
  readonly item: T;
  readonly index: number;
  readonly isSelected: boolean;
}
