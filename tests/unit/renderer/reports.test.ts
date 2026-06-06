import { describe, it, expect } from 'vitest';
import type { CashflowPoint, DashboardTransaction } from '@shared/types/dashboard';
import { topCategories, savingsRate, yearOverYear, biggestMovements } from '@renderer/lib/reports';

function tx(p: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 'id',
    accountId: 'a1',
    date: '2026-05-01',
    amount: -10,
    labelRaw: 'x',
    labelClean: 'X',
    categoryId: 'c1',
    categoryName: 'Divers',
    categoryColor: null,
    categoryIcon: null,
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    ...p,
  };
}

describe('topCategories', () => {
  it('aggregates expenses by category, ignoring income/transfers/uncategorised', () => {
    const result = topCategories([
      tx({ amount: -30, categoryName: 'Courses' }),
      tx({ amount: -20, categoryName: 'Courses' }),
      tx({ amount: -40, categoryName: 'Loisirs' }),
      tx({ amount: 2000, categoryName: 'Salaire' }), // income
      tx({ amount: -500, isInternalTransfer: true, categoryName: 'Vir' }), // transfer
      tx({ amount: -15, categoryName: null }), // uncategorised
    ]);
    expect(result).toEqual([
      { name: 'Courses', total: 50 },
      { name: 'Loisirs', total: 40 },
    ]);
  });

  it('caps to the limit', () => {
    const txns = ['A', 'B', 'C'].map((n, i) => tx({ amount: -(i + 1) * 10, categoryName: n }));
    expect(topCategories(txns, 2)).toHaveLength(2);
  });
});

describe('savingsRate', () => {
  const series: CashflowPoint[] = [
    { period: '2026-04', income: 2000, expense: -1500, net: 500 },
    { period: '2026-05', income: 2000, expense: -1000, net: 1000 },
  ];
  it('is net / income as a percentage', () => {
    expect(savingsRate(series)).toBeCloseTo((1500 / 4000) * 100, 5);
  });
  it('is null when there is no income', () => {
    expect(savingsRate([{ period: '2026-04', income: 0, expense: -100, net: -100 }])).toBeNull();
  });
});

describe('yearOverYear', () => {
  it('picks the latest year and the delta vs the previous', () => {
    const r = yearOverYear([
      { period: '2025', income: 9000, expense: -8000, net: 1000 },
      { period: '2026', income: 9000, expense: -6000, net: 3000 },
    ]);
    expect(r?.current.period).toBe('2026');
    expect(r?.previous?.period).toBe('2025');
    expect(r?.netDelta).toBe(2000);
  });
  it('has a null delta with a single year', () => {
    const r = yearOverYear([{ period: '2026', income: 1, expense: 0, net: 1 }]);
    expect(r?.previous).toBeNull();
    expect(r?.netDelta).toBeNull();
  });
});

describe('biggestMovements', () => {
  it('sorts by magnitude, excludes transfers, caps', () => {
    const txns = [
      tx({ id: 'a', amount: -50 }),
      tx({ id: 'b', amount: 2000 }),
      tx({ id: 'c', amount: -900, isInternalTransfer: true }),
      tx({ id: 'd', amount: -120 }),
    ];
    expect(biggestMovements(txns, 2).map((t) => t.id)).toEqual(['b', 'd']);
  });
});
