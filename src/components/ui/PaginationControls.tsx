import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { memo } from 'react';

import { designSystem } from '../../styles/designSystem';

interface PaginationControlsProps {
  /** Current page index (0-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Handler for previous page navigation */
  onPrevPage: () => void;
  /** Handler for next page navigation */
  onNextPage: () => void;
  /** Whether previous page button is disabled */
  canGoPrev?: boolean;
  /** Whether next page button is disabled */
  canGoNext?: boolean;
}

/**
 * Pagination controls component for selection pages.
 * Displays Previous/Next buttons with a page indicator.
 *
 * @example
 * ```tsx
 * <PaginationControls
 *   currentPage={currentPage}
 *   totalPages={totalPages}
 *   onPrevPage={goToPrevPage}
 *   onNextPage={goToNextPage}
 *   canGoPrev={canGoPrev}
 *   canGoNext={canGoNext}
 * />
 * ```
 */
export const PaginationControls = memo(function PaginationControls({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  canGoPrev,
  canGoNext,
}: PaginationControlsProps) {
  // Derive disabled states if not explicitly provided
  const isPrevDisabled = canGoPrev === undefined ? currentPage === 0 : !canGoPrev;
  const isNextDisabled = canGoNext === undefined ? currentPage === totalPages - 1 : !canGoNext;

  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        marginTop: '24px',
        width: '100%',
      }}
    >
      <button
        onClick={onPrevPage}
        disabled={isPrevDisabled}
        style={{
          height: 'auto',
          width: 'auto',
          fontSize: '18px',
          fontWeight: 500,
          padding: '8px 16px',
          background: 'transparent',
          color: isPrevDisabled ? designSystem.colors.textMuted : designSystem.colors.info,
          border: 'none',
          borderRadius: '0',
          cursor: isPrevDisabled ? 'not-allowed' : 'pointer',
          opacity: isPrevDisabled ? 0.5 : 1,
          transition: designSystem.transitions.base,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: 'none',
          justifySelf: 'start',
        }}
      >
        <FontAwesomeIcon icon={faChevronLeft} style={{ marginRight: '6px' }} />
        Vorherige
      </button>

      <span
        style={{
          fontSize: '18px',
          color: designSystem.colors.textSecondary,
          fontWeight: 500,
          justifySelf: 'center',
        }}
      >
        Seite {currentPage + 1} von {totalPages}
      </span>

      <button
        onClick={onNextPage}
        disabled={isNextDisabled}
        style={{
          height: 'auto',
          width: 'auto',
          fontSize: '18px',
          fontWeight: 500,
          padding: '8px 16px',
          background: 'transparent',
          color: isNextDisabled ? designSystem.colors.textMuted : designSystem.colors.info,
          border: 'none',
          borderRadius: '0',
          cursor: isNextDisabled ? 'not-allowed' : 'pointer',
          opacity: isNextDisabled ? 0.5 : 1,
          transition: designSystem.transitions.base,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: 'none',
          justifySelf: 'end',
        }}
      >
        Nächste
        <FontAwesomeIcon icon={faChevronRight} style={{ marginLeft: '6px' }} />
      </button>
    </div>
  );
});
