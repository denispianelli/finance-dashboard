import { describe, it, expect } from 'vitest';
import type { CashflowPoint, DashboardTransaction } from '@shared/types/dashboard';
import {
  topCategories,
  savingsRate,
  yearOverYear,
  biggestMovements,
  availablePeriods,
  monthlyFlowForYear,
  txInPeriod,
  periodTotals,
  dailyFlow,
  previousPeriod,
  periodVerdict,
  accountComposition,
  categoryBreakdown,
} from '@renderer/lib/reports';

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

const series2y: CashflowPoint[] = [
  { period: '2025-11', income: 100, expense: -40, net: 60 },
  { period: '2026-03', income: 200, expense: -50, net: 150 },
  { period: '2026-05', income: 300, expense: -100, net: 200 },
];

describe('availablePeriods', () => {
  it('lists distinct years and months newest-first', () => {
    expect(availablePeriods(series2y)).toEqual({
      years: ['2026', '2025'],
      months: ['2026-05', '2026-03', '2025-11'],
    });
  });
});

describe('monthlyFlowForYear', () => {
  it('trims to the populated range, keeping empty months in between', () => {
    // 2026 has data in mars and mai → range is mars..mai (avr kept, empty).
    const pts = monthlyFlowForYear(series2y, '2026');
    expect(pts).toEqual([
      { label: 'mars', income: 200, expense: 50 },
      { label: 'avr', income: 0, expense: 0 },
      { label: 'mai', income: 300, expense: 100 },
    ]);
  });

  it('returns an empty array for a year with no activity', () => {
    expect(monthlyFlowForYear(series2y, '2099')).toEqual([]);
  });
});

describe('txInPeriod', () => {
  it('keeps only transactions whose date matches the period value', () => {
    const txns = [
      tx({ id: 'a', date: '2023-06-10' }),
      tx({ id: 'b', date: '2024-06-10' }),
      tx({ id: 'c', date: '2024-07-10' }),
    ];
    expect(txInPeriod(txns, { granularity: 'year', value: '2024' }).map((t) => t.id)).toEqual([
      'b',
      'c',
    ]);
    expect(txInPeriod(txns, { granularity: 'month', value: '2024-06' }).map((t) => t.id)).toEqual([
      'b',
    ]);
  });
});

describe('periodTotals', () => {
  it('sums income/expense/net, excluding transfers', () => {
    const txns = [
      tx({ amount: 2000 }),
      tx({ amount: -500 }),
      tx({ amount: -300, isInternalTransfer: true }),
      tx({ amount: 400, categoryId: 'cat-transferts' }), // transfer by category, also excluded
    ];
    expect(periodTotals(txns)).toEqual({ income: 2000, expense: -500, net: 1500 });
  });

  it('subtracts a refund from expenses instead of counting it as income', () => {
    // 1000 in, 500 spent on shoes, 250 refunded → 1000 in / 250 out, net 750.
    const txns = [
      tx({ amount: 1000 }),
      tx({ amount: -500 }),
      tx({ amount: 250, categoryId: 'cat-remboursement' }),
    ];
    expect(periodTotals(txns)).toEqual({ income: 1000, expense: -250, net: 750 });
  });
});

describe('categoryBreakdown', () => {
  it('groups income by category, excluding transfers/refunds and folding uncategorised', () => {
    const txns = [
      tx({ amount: 2000, categoryName: 'Salaire', categoryColor: '#0a0' }),
      tx({ amount: 500, categoryName: 'Salaire', categoryColor: '#0a0' }),
      tx({ amount: 300, categoryName: null, categoryColor: null }),
      tx({ amount: -800, categoryName: 'Loyer' }), // expense — ignored for 'in'
      tx({ amount: 400, categoryId: 'cat-transferts' }), // transfer — ignored
      tx({ amount: 250, categoryId: 'cat-remboursement' }), // refund — ignored
    ];
    expect(categoryBreakdown(txns, 'in')).toEqual([
      { name: 'Salaire', value: 2500, color: '#0a0' },
      { name: 'Non catégorisé', value: 300, color: '#6E6E78' },
    ]);
  });

  it('groups expenses by magnitude, largest first', () => {
    const txns = [
      tx({ amount: -800, categoryName: 'Loyer', categoryColor: '#a00' }),
      tx({ amount: -120, categoryName: 'Courses', categoryColor: '#0a0' }),
      tx({ amount: -30, categoryName: 'Courses', categoryColor: '#0a0' }),
      tx({ amount: 2000, categoryName: 'Salaire' }), // income — ignored for 'out'
    ];
    expect(categoryBreakdown(txns, 'out')).toEqual([
      { name: 'Loyer', value: 800, color: '#a00' },
      { name: 'Courses', value: 150, color: '#0a0' },
    ]);
  });
});

describe('dailyFlow', () => {
  it('zero-fills every day of the month with sparse labels, excluding transfers', () => {
    const txns = [
      tx({ date: '2024-06-02', amount: 1000 }),
      tx({ date: '2024-06-05', amount: -300 }),
      tx({ date: '2024-06-05', amount: -200, isInternalTransfer: true }),
      tx({ date: '2024-07-01', amount: -999 }),
    ];
    const s = dailyFlow(txns, '2024-06');
    expect(s).toHaveLength(30); // June
    expect(s[1]).toEqual({ label: '', income: 1000, expense: 0 }); // day 2 (unlabelled)
    expect(s[4]).toEqual({ label: '5', income: 0, expense: 300 }); // day 5 (labelled)
    expect(s[0]?.label).toBe('1'); // day 1 always labelled
    expect(s[9]?.label).toBe('10'); // every 5th labelled
    expect(s[2]).toEqual({ label: '', income: 0, expense: 0 }); // day 3, empty
  });
});

describe('previousPeriod', () => {
  it('steps back a year or the same month last year', () => {
    expect(previousPeriod({ granularity: 'year', value: '2024' })).toEqual({
      granularity: 'year',
      value: '2023',
    });
    expect(previousPeriod({ granularity: 'month', value: '2024-06' })).toEqual({
      granularity: 'month',
      value: '2023-06',
    });
  });
});

describe('periodVerdict', () => {
  it('reports income/spend/net, positive flag, savings rate and delta vs previous', () => {
    const scoped = [tx({ amount: 2000 }), tx({ amount: -1500 })];
    const prev = [tx({ amount: 1000 }), tx({ amount: -900 })]; // prev net 100
    const v = periodVerdict(scoped, prev);
    expect(v).toMatchObject({ income: 2000, expense: -1500, net: 500, positive: true });
    expect(v.savingsRate).toBeCloseTo(25, 5); // 500/2000
    expect(v.deltaPct).toBeCloseTo(400, 5); // (500-100)/100
  });

  it('flags a negative period and nulls savings/delta when there is no base', () => {
    const v = periodVerdict([tx({ amount: 100 }), tx({ amount: -400 })], []);
    expect(v.positive).toBe(false);
    expect(v.net).toBe(-300);
    expect(v.deltaPct).toBeNull(); // no previous income/net
  });
});

describe('accountComposition', () => {
  it('keeps positive balances as slices, dropping null/zero', () => {
    const nw = {
      total: 9200,
      accounts: [
        { accountId: 'a', name: 'Perso', balance: 1200 },
        { accountId: 'b', name: 'Livret', balance: 8000 },
        { accountId: 'c', name: 'Vide', balance: null },
        { accountId: 'd', name: 'Zero', balance: 0 },
      ],
    };
    expect(accountComposition(nw)).toEqual([
      { name: 'Perso', value: 1200 },
      { name: 'Livret', value: 8000 },
    ]);
    expect(accountComposition(null)).toEqual([]);
  });
});
