import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { ReactNode } from 'react';

/**
 * Defines why a modal was closed.
 * Used by callers to handle different close scenarios.
 */
export type CloseReason = 'backdrop' | 'action' | 'timeout' | 'escape';

/**
 * Modal icon can be a FontAwesome icon or a custom React node (e.g., SVG).
 */
export type ModalIcon = IconDefinition | ReactNode;

/**
 * Defines an action button in a modal.
 */
export interface ModalAction {
  /** Button label text */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** If true, clicking the action will automatically trigger onClose('action') */
  closesModal?: boolean;
  /** Visual variant for the button */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Optional custom styles */
  style?: React.CSSProperties;
  /** Optional hover styles */
  hoverStyle?: React.CSSProperties;
}

/**
 * Semantic tones for modal styling.
 * Each tone maps to a color scheme.
 */
export type ModalTone = 'success' | 'warning' | 'error' | 'info';

/**
 * Common props for modal backdrop behavior.
 */
export interface ModalBackdropProps {
  /** Opacity of the backdrop overlay (0-1) */
  backdropOpacity?: number;
  /** CSS blur value for backdrop (e.g., '4px') */
  backdropBlur?: string;
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean;
}

/**
 * Props for ModalShell component.
 * Handles overlay mechanics: backdrop, z-index, auto-close timing.
 */
export interface ModalShellProps extends ModalBackdropProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal should close, with reason */
  onClose: (reason: CloseReason) => void;
  /** Auto-close after this many milliseconds (optional) */
  autoCloseMs?: number;
  /** Modal content */
  children: ReactNode;
  /** CSS z-index value (default: 9999) */
  zIndex?: number;
  /** Key to reset auto-close timer (e.g., when content changes) */
  timerResetKey?: string | number;
  /** Whether to show progress indicator for timed modals */
  showProgress?: boolean;
  /** Duration for progress bar animation (defaults to autoCloseMs) */
  progressDuration?: number;
}

/**
 * Props for ModalCard component.
 * Handles presentation: icon, title, body, actions.
 */
export interface ModalCardProps {
  /** Semantic tone for color scheme */
  tone?: ModalTone;
  /** Optional custom primary color (overrides tone) */
  customPrimaryColor?: string;
  /** Optional custom background color (overrides tone) */
  customBackgroundColor?: string;
  /** Icon to display (FontAwesome or ReactNode) */
  icon?: ModalIcon;
  /** Title text */
  title: string;
  /** Optional subtitle/body content */
  body?: ReactNode;
  /** Action buttons */
  actions?: ModalAction[];
  /** Custom content to render instead of default body/actions layout */
  children?: ReactNode;
  /** Animation to apply on mount */
  animation?: 'none' | 'pop' | 'slideIn' | 'fadeIn';
  /** Card width (default: 90%, maxWidth: 700px) */
  width?: string;
  /** Card max width (default: 700px) */
  maxWidth?: string;
  /** Card border radius (default: 32px) */
  borderRadius?: string;
  /** Card padding (default: 64px) */
  padding?: string;
  /** Prevent click events from propagating to backdrop */
  stopPropagation?: boolean;
  /** Progress indicator props (when used with ModalShell) */
  progressIndicator?: {
    duration: number;
    isActive: boolean;
    animationKey: number;
  };
}

/**
 * Tone-to-color mapping for modal cards.
 * Based on existing ActivityScanningPage modal colors.
 */
export const MODAL_TONE_COLORS: Record<ModalTone, { primary: string; background: string }> = {
  success: { primary: '#83cd2d', background: '#83cd2d' },
  warning: { primary: '#f87C10', background: '#f87C10' },
  error: { primary: '#ef4444', background: '#ef4444' },
  info: { primary: '#6366f1', background: '#6366f1' },
};

/**
 * Extended scan modal colors for domain-specific variants.
 */
export const SCAN_MODAL_COLORS = {
  checkIn: { primary: '#83cd2d', background: '#83cd2d' },
  transfer: { primary: '#83cd2d', background: '#83cd2d' },
  checkOut: { primary: '#f87C10', background: '#f87C10' },
  destinationSelection: { primary: '#f87C10', background: '#f87C10' },
  schulhof: { primary: '#F59E0B', background: '#F59E0B' },
  error: { primary: '#ef4444', background: '#ef4444' },
  supervisor: { primary: '#3B82F6', background: '#3B82F6' },
  dailyCheckoutConfirmation: { primary: '#6366f1', background: '#6366f1' },
  dailyCheckoutFarewell: { primary: '#6366f1', background: '#6366f1' },
  feedbackPrompt: { primary: '#6366f1', background: '#6366f1' },
  info: { primary: '#6366f1', background: '#6366f1' },
} as const;
