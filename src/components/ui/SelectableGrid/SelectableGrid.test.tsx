import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectableGrid } from './SelectableGrid';

describe('SelectableGrid', () => {
  it('renders all items via renderItem', () => {
    const items = ['Alice', 'Bob', 'Charlie'];
    render(
      <SelectableGrid
        items={items}
        renderItem={item => <div key={item}>{item}</div>}
        emptySlotCount={0}
        emptySlotIcon="person"
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders empty slots when emptySlotCount > 0', () => {
    render(
      <SelectableGrid
        items={[]}
        renderItem={() => null}
        emptySlotCount={3}
        emptySlotIcon="person"
      />
    );
    const leerTexts = screen.getAllByText('Leer');
    expect(leerTexts).toHaveLength(3);
  });

  it('renders no empty slots when emptySlotCount is 0', () => {
    render(
      <SelectableGrid
        items={['Item']}
        renderItem={item => <div key={item}>{item}</div>}
        emptySlotCount={0}
        emptySlotIcon="person"
      />
    );
    expect(screen.queryByText('Leer')).not.toBeInTheDocument();
  });

  it('uses a 5-column grid layout', () => {
    const { container } = render(
      <SelectableGrid
        items={[]}
        renderItem={() => null}
        emptySlotCount={0}
        emptySlotIcon="person"
      />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 1fr)');
  });

  it('passes index to renderItem', () => {
    const items = ['A', 'B'];
    const indices: number[] = [];
    render(
      <SelectableGrid
        items={items}
        renderItem={(item, index) => {
          indices.push(index);
          return <div key={item}>{item}</div>;
        }}
        emptySlotCount={0}
        emptySlotIcon="person"
      />
    );
    expect(indices).toEqual([0, 1]);
  });
});
