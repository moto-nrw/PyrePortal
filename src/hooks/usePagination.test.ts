import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePagination } from './usePagination';

describe('usePagination', () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);

  it('returns first page by default', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    expect(result.current.currentPage).toBe(0);
    expect(result.current.paginatedItems).toHaveLength(10);
    expect(result.current.paginatedItems[0]).toBe('item-0');
  });

  it('calculates total pages', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    expect(result.current.totalPages).toBe(3); // 25 items / 10 per page = 3 pages
  });

  it('navigates to next page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    act(() => result.current.goToNextPage());
    expect(result.current.currentPage).toBe(1);
    expect(result.current.paginatedItems[0]).toBe('item-10');
  });

  it('navigates to previous page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10, initialPage: 2 }));
    act(() => result.current.goToPrevPage());
    expect(result.current.currentPage).toBe(1);
  });

  it('cannot go before first page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    expect(result.current.canGoPrev).toBe(false);
    act(() => result.current.goToPrevPage());
    expect(result.current.currentPage).toBe(0);
  });

  it('cannot go past last page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10, initialPage: 2 }));
    expect(result.current.canGoNext).toBe(false);
    act(() => result.current.goToNextPage());
    expect(result.current.currentPage).toBe(2);
  });

  it('calculates empty slots on last page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10, initialPage: 2 }));
    // Last page has 5 items, 5 empty slots
    expect(result.current.paginatedItems).toHaveLength(5);
    expect(result.current.emptySlotCount).toBe(5);
  });

  it('no empty slots on full page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    expect(result.current.emptySlotCount).toBe(0);
  });

  it('resets to first page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10, initialPage: 2 }));
    act(() => result.current.resetPage());
    expect(result.current.currentPage).toBe(0);
  });

  it('sets specific page', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    act(() => result.current.setPage(1));
    expect(result.current.currentPage).toBe(1);
  });

  it('clamps page to valid range', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10 }));
    act(() => result.current.setPage(999));
    expect(result.current.currentPage).toBe(2); // Max page
    act(() => result.current.setPage(-5));
    expect(result.current.currentPage).toBe(0); // Min page
  });

  it('handles empty items', () => {
    const { result } = renderHook(() => usePagination([], { itemsPerPage: 10 }));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toHaveLength(0);
    expect(result.current.emptySlotCount).toBe(10);
  });

  it('uses default itemsPerPage of 10', () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.paginatedItems).toHaveLength(10);
  });

  it('canGoNext and canGoPrev flags', () => {
    const { result } = renderHook(() => usePagination(items, { itemsPerPage: 10, initialPage: 1 }));
    expect(result.current.canGoNext).toBe(true);
    expect(result.current.canGoPrev).toBe(true);
  });
});
