import { useMemo, useRef } from 'react';

/**
 * Sorts items with the selected ones first (then alphabetically by name),
 * and freezes the resulting order on the first user interaction so items
 * do not move around while the user keeps toggling.
 *
 * Call `freezeSortOrder()` at the start of the first interaction handler.
 * Items unknown to the frozen order (e.g. loaded later) are appended at the end.
 */
export function useFrozenSortOrder<T extends { id: number; name: string }>(
  items: T[],
  selected: ReadonlyArray<{ id: number }>
): { sortedItems: T[]; freezeSortOrder: () => void } {
  // Freeze sort order after first user interaction to prevent items from moving
  const frozenSortOrder = useRef<Map<number, number> | null>(null);

  // Sort: pre-selected at top on page load, then freeze after first interaction
  const sortedItems = useMemo(() => {
    if (frozenSortOrder.current) {
      return [...items].sort((a, b) => {
        const aOrder = frozenSortOrder.current!.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = frozenSortOrder.current!.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
    }
    const selectedIds = new Set(selected.map(s => s.id));
    return [...items].sort((a, b) => {
      const aSel = selectedIds.has(a.id);
      const bSel = selectedIds.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [items, selected]);

  const freezeSortOrder = () => {
    if (!frozenSortOrder.current) {
      const orderMap = new Map<number, number>();
      sortedItems.forEach((item, idx) => orderMap.set(item.id, idx));
      frozenSortOrder.current = orderMap;
    }
  };

  return { sortedItems, freezeSortOrder };
}
