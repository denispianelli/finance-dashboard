import { describe, it, expect } from 'vitest';
import {
  monthLabelFr,
  splitEuro,
  kpiDelta,
  sparkPoints,
  chartGeometry,
  topSpendingCategories,
  latestMonth,
} from '@renderer/lib/dashboardCharts';
import type { DashboardTransaction, MonthPoint } from '@shared/types/dashboard';

function tx(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 'id',
    accountId: 'a1',
    date: '2026-05-10',
    amount: -10,
    labelRaw: 'X',
    labelClean: 'X',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isInternalTransfer: false,
    userModified: false,
    ...over,
  };
}

describe('monthLabelFr', () => {
  it('maps yyyy-mm to the French month name', () => {
    expect(monthLabelFr('2026-05')).toBe('mai');
    expect(monthLabelFr('2026-01')).toBe('janvier');
    expect(monthLabelFr('2026-12')).toBe('décembre');
  });
});

describe('splitEuro', () => {
  it('splits the integer part from the decimals + symbol', () => {
    expect(splitEuro(1487.32)).toEqual({ value: '1 487', sub: ',32 €' });
  });
  it('handles whole amounts', () => {
    expect(splitEuro(0)).toEqual({ value: '0', sub: ',00 €' });
  });
});

describe('kpiDelta', () => {
  it('returns undefined without a usable baseline', () => {
    expect(kpiDelta(100, 0, true)).toBeUndefined();
  });
  it('colors a rise green when higher is better (income)', () => {
    expect(kpiDelta(110, 100, true)).toEqual({ delta: '+ 10,0 %', deltaDir: 'up' });
  });
  it('colors a rise red when higher is worse (expenses)', () => {
    expect(kpiDelta(110, 100, false)).toEqual({ delta: '+ 10,0 %', deltaDir: 'down' });
  });
  it('uses a minus sign for a decrease', () => {
    expect(kpiDelta(90, 100, true)?.delta).toBe('− 10,0 %');
  });
});

describe('sparkPoints', () => {
  it('returns empty for no values', () => {
    expect(sparkPoints([])).toBe('');
  });
  it('produces one x,y pair per value, spanning the width', () => {
    const pts = sparkPoints([1, 2, 3]).split(' ');
    expect(pts).toHaveLength(3);
    expect(pts[0]?.startsWith('0,')).toBe(true);
    expect(pts[2]?.startsWith('84,')).toBe(true);
  });
  it('puts the max near the top (small y) and min near the bottom', () => {
    const [lo, hi] = sparkPoints([0, 10]).split(' ');
    const yLo = Number(lo?.split(',')[1]);
    const yHi = Number(hi?.split(',')[1]);
    expect(yHi).toBeLessThan(yLo);
  });
});

describe('chartGeometry', () => {
  it('is empty for no values', () => {
    expect(chartGeometry([])).toEqual({ line: '', area: '' });
  });
  it('builds a line and a closed area path', () => {
    const { line, area } = chartGeometry([1, 2, 3]);
    expect(line.split(' ')).toHaveLength(3);
    expect(area.startsWith('M')).toBe(true);
    expect(area.endsWith('Z')).toBe(true);
  });
});

describe('topSpendingCategories', () => {
  const txs = [
    tx({ amount: -80, categoryName: 'Alimentation', date: '2026-05-02' }),
    tx({ amount: -20, categoryName: 'Alimentation', date: '2026-05-12' }),
    tx({ amount: -50, categoryName: 'Transport', date: '2026-05-05' }),
    tx({ amount: -999, categoryName: 'Transport', date: '2026-04-05' }), // other month
    tx({ amount: 3000, categoryName: 'Revenus', date: '2026-05-01' }), // income, ignored
    tx({ amount: -30, categoryName: null, date: '2026-05-09' }), // uncategorized
  ];

  it('sums expenses by category for the month, descending', () => {
    expect(topSpendingCategories(txs, '2026-05')).toEqual([
      { name: 'Alimentation', total: 100 },
      { name: 'Transport', total: 50 },
    ]);
  });

  it('respects the limit', () => {
    expect(topSpendingCategories(txs, '2026-05', 1)).toEqual([
      { name: 'Alimentation', total: 100 },
    ]);
  });
});

describe('latestMonth', () => {
  it('returns the last series month or null', () => {
    const series: MonthPoint[] = [
      { month: '2026-04', income: 0, expense: 0, net: 0, balance: 0 },
      { month: '2026-05', income: 0, expense: 0, net: 0, balance: 0 },
    ];
    expect(latestMonth(series)).toBe('2026-05');
    expect(latestMonth([])).toBeNull();
  });
});
