import { useState, useMemo, useCallback } from 'react';

export interface UsePaginationOptions {
  /** Items per page (default: 10) */
  itemsPerPage?: number;
  /** Initial page index (default: 0) */
  initialPage?: number;
}

export interface UsePaginationResult<T> {
  /** Current page index (0-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Items on the current page */
  paginatedItems: T[];
  /** Number of empty slots to fill the grid */
  emptySlotCount: number;
  /** Whether there is a next page */
  canGoNext: boolean;
  /** Whether there is a previous page */
  canGoPrev: boolean;
  /** Navigate to the next page */
  goToNextPage: () => void;
  /** Navigate to the previous page */
  goToPrevPage: () => void;
  /** Reset to the first page */
  resetPage: () => void;
  /** Set a specific page */
  setPage: (page: number) => void;
}

/**
 * Generic pagination hook for selection pages.
 * Manages page state and provides paginated items with empty slot calculation.
 *
 * @param items - Array of items to paginate
 * @param options - Pagination configuration
 * @returns Pagination state and controls
 *
 * @example
 * ```tsx
 * const { paginatedItems, emptySlotCount, goToNextPage, canGoNext } = usePagination(users, {
 *   itemsPerPage: 10,
 * });
 * ```
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const { itemsPerPage = 10, initialPage = 0 } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(items.length / itemsPerPage));
  }, [items.length, itemsPerPage]);

  const paginatedItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, currentPage, itemsPerPage]);

  const emptySlotCount = useMemo(() => {
    const itemsOnPage = paginatedItems.length;
    if (itemsOnPage < itemsPerPage) {
      return itemsPerPage - itemsOnPage;
    }
    return 0;
  }, [paginatedItems.length, itemsPerPage]);

  const canGoNext = currentPage < totalPages - 1;
  const canGoPrev = currentPage > 0;

  const goToNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
  }, []);

  const resetPage = useCallback(() => {
    setCurrentPage(0);
  }, []);

  const setPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
    },
    [totalPages]
  );

  return {
    currentPage,
    totalPages,
    paginatedItems,
    emptySlotCount,
    canGoNext,
    canGoPrev,
    goToNextPage,
    goToPrevPage,
    resetPage,
    setPage,
  };
}
