// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { TxTableRow, type TxRow } from '@renderer/components/dashboard/TxTable';

afterEach(() => {
  cleanup();
});

function row(over: Partial<TxRow> = {}): TxRow {
  return {
    id: 't1',
    date: '01 jan',
    icon: 'wallet',
    main: 'CARREFOUR',
    sub: 'cb carrefour',
    catColor: '#888888',
    catName: 'Non catégorisé',
    amount: -10,
    amountKind: 'expense',
    edited: false,
    originalHint: null,
    editDate: '2026-01-01',
    editAmount: -10,
    editLabel: 'carrefour',
    uncategorized: true,
    ...over,
  };
}

describe('TxTableRow category cell', () => {
  it('shows a skeleton while categorizing an uncategorized row', () => {
    const { container, queryByText } = render(
      <TxTableRow row={row({ uncategorized: true })} categorizing />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(queryByText('Non catégorisé')).toBeNull();
  });

  it('shows the category name when not categorizing', () => {
    const { container, getByText } = render(<TxTableRow row={row({ uncategorized: true })} />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
    getByText('Non catégorisé');
  });

  it('never skeletons an already-categorized row, even during a pass', () => {
    const { container, getByText } = render(
      <TxTableRow row={row({ uncategorized: false, catName: 'Alimentation' })} categorizing />,
    );
    expect(container.querySelector('.animate-pulse')).toBeNull();
    getByText('Alimentation');
  });
});
