import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFrozenSortOrder } from './useFrozenSortOrder';

type Item = { id: number; name: string };

const items: Item[] = [
  { id: 1, name: 'Clara' },
  { id: 2, name: 'Anna' },
  { id: 3, name: 'Ben' },
];

const setup = (initialItems: Item[], initialSelected: Array<{ id: number }>) =>
  renderHook(
    ({ items: i, selected: s }: { items: Item[]; selected: Array<{ id: number }> }) =>
      useFrozenSortOrder(i, s),
    { initialProps: { items: initialItems, selected: initialSelected } }
  );

describe('useFrozenSortOrder', () => {
  it('sorts alphabetically when nothing is selected', () => {
    const { result } = setup(items, []);
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Anna', 'Ben', 'Clara']);
  });

  it('sorts selected items first, then alphabetically', () => {
    const { result } = setup(items, [{ id: 1 }]);
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Clara', 'Anna', 'Ben']);
  });

  it('re-sorts on selection changes while not frozen', () => {
    const { result, rerender } = setup(items, []);

    rerender({ items, selected: [{ id: 3 }] });
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Ben', 'Anna', 'Clara']);
  });

  it('keeps the order stable after freezing despite selection changes', () => {
    const { result, rerender } = setup(items, [{ id: 1 }]);
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Clara', 'Anna', 'Ben']);

    act(() => result.current.freezeSortOrder());

    // Selecting another item would normally move it to the top — frozen order wins
    rerender({ items, selected: [{ id: 3 }] });
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Clara', 'Anna', 'Ben']);
  });

  it('appends items unknown to the frozen order at the end', () => {
    const { result, rerender } = setup(items, []);

    act(() => result.current.freezeSortOrder());

    const withNewItem = [...items, { id: 4, name: 'Aaron' }];
    rerender({ items: withNewItem, selected: [] });
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Anna', 'Ben', 'Clara', 'Aaron']);
  });

  it('does not re-freeze on subsequent freeze calls', () => {
    const { result, rerender } = setup(items, [{ id: 1 }]);

    act(() => result.current.freezeSortOrder());
    rerender({ items, selected: [{ id: 3 }] });

    // A second freeze must keep the first frozen order, not capture a new one
    act(() => result.current.freezeSortOrder());
    rerender({ items, selected: [{ id: 2 }] });
    expect(result.current.sortedItems.map(i => i.name)).toEqual(['Clara', 'Anna', 'Ben']);
  });
});
