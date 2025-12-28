import type { IconType } from './types';

interface IconProps {
  size?: number;
  stroke?: string;
  strokeWidth?: string;
}

/**
 * Person icon (user silhouette)
 */
const PersonIcon = ({ size = 36, stroke = 'currentColor', strokeWidth = '2.5' }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/**
 * Calendar icon
 */
const CalendarIcon = ({ size = 48, stroke = 'currentColor', strokeWidth = '2' }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/**
 * Door icon
 */
const DoorIcon = ({ size = 48, stroke = 'currentColor', strokeWidth = '2' }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
    <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
    <circle cx="11" cy="12" r="1" />
  </svg>
);

/**
 * Icon components for SelectableCard (normal size, current color)
 */
export const cardIcons: Record<IconType, React.FC<{ size?: number }>> = {
  person: ({ size = 36 }) => <PersonIcon size={size} />,
  calendar: ({ size = 48 }) => <CalendarIcon size={size} />,
  door: ({ size = 48 }) => <DoorIcon size={size} />,
};

/**
 * Icon components for EmptySlot (smaller, muted gray)
 */
export const emptySlotIcons: Record<IconType, React.FC> = {
  person: () => <PersonIcon size={32} stroke="#9CA3AF" strokeWidth="1.5" />,
  calendar: () => <CalendarIcon size={32} stroke="#9CA3AF" strokeWidth="1.5" />,
  door: () => <DoorIcon size={32} stroke="#9CA3AF" strokeWidth="1.5" />,
};
