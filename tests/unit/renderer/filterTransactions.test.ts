import { describe, it, expect } from 'vitest';
import { filterTransactions, periodStart, toLocalISODate } from '@renderer/lib/filterTransactions';
import type { DashboardTransaction } from '@shared/types/dashboard';

function tx(over: Partial<DashboardTransaction> = {}): DashboardTransaction {
  return {
    id: 't1',
    accountId: 'a1',
    date: '2026-05-14',
    amount: -84.3,
    labelRaw: 'CB CARREFOUR',
    labelClean: 'Carrefour Market',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    ...over,
  };
}

const TODAY = '2026-06-03';
const ALL = { from: null, to: null, categoryId: 'all', query: '', type: 'all' } as const;

describe('periodStart', () => {
  it('returns null for "all"', () => {
    expect(periodStart('all', TODAY)).toBeNull();
  });
  it('returns Jan 1st of the current year for "year"', () => {
    expect(periodStart('year', TODAY)).toBe('2026-01-01');
  });
  it('returns today minus 30 days for "30d"', () => {
    expect(periodStart('30d', TODAY)).toBe('2026-05-04');
  });
  it('returns today minus 3 months for "3m"', () => {
    expect(periodStart('3m', TODAY)).toBe('2026-03-03');
  });
});

describe('toLocalISODate', () => {
  it('formats a Date as local-time yyyy-mm-dd', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('filterTransactions', () => {
  it('returns everything with the default (unbounded) filters', () => {
    const txns = [tx({ id: 'a' }), tx({ id: 'b' })];
    expect(filterTransactions(txns, ALL)).toHaveLength(2);
  });

  it('excludes transactions before the inclusive lower bound (from)', () => {
    const txns = [tx({ id: 'old', date: '2026-01-10' }), tx({ id: 'new', date: '2026-05-20' })];
    const out = filterTransactions(txns, { ...ALL, from: '2026-05-04' });
    expect(out.map((t) => t.id)).toEqual(['new']);
  });

  it('includes a transaction exactly on the lower bound', () => {
    const txns = [tx({ id: 'edge', date: '2026-05-04' })];
    expect(filterTransactions(txns, { ...ALL, from: '2026-05-04' })).toHaveLength(1);
  });

  it('excludes transactions after the inclusive upper bound (to)', () => {
    const txns = [tx({ id: 'in', date: '2026-05-10' }), tx({ id: 'after', date: '2026-05-20' })];
    const out = filterTransactions(txns, { ...ALL, to: '2026-05-15' });
    expect(out.map((t) => t.id)).toEqual(['in']);
  });

  it('includes a transaction exactly on the upper bound', () => {
    const txns = [tx({ id: 'edge', date: '2026-05-15' })];
    expect(filterTransactions(txns, { ...ALL, to: '2026-05-15' })).toHaveLength(1);
  });

  it('keeps only transactions inside a closed [from, to] range', () => {
    const txns = [
      tx({ id: 'before', date: '2026-04-30' }),
      tx({ id: 'inside', date: '2026-05-10' }),
      tx({ id: 'after', date: '2026-06-01' }),
    ];
    const out = filterTransactions(txns, { ...ALL, from: '2026-05-01', to: '2026-05-31' });
    expect(out.map((t) => t.id)).toEqual(['inside']);
  });

  it('filters by a specific category id', () => {
    const txns = [tx({ id: 'a', categoryId: 'cat-1' }), tx({ id: 'b', categoryId: 'cat-2' })];
    const out = filterTransactions(txns, { ...ALL, categoryId: 'cat-1' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('filters uncategorized transactions when categoryId is null', () => {
    const txns = [tx({ id: 'a', categoryId: null }), tx({ id: 'b', categoryId: 'cat-2' })];
    const out = filterTransactions(txns, { ...ALL, categoryId: null });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('matches search case- and accent-insensitively on labelClean', () => {
    const txns = [
      tx({ id: 'a', labelClean: 'Café de la Gare' }),
      tx({ id: 'b', labelClean: 'Loyer' }),
    ];
    const out = filterTransactions(txns, { ...ALL, query: 'cafe' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('filters income (amount > 0) and expense (amount < 0)', () => {
    const txns = [tx({ id: 'in', amount: 100 }), tx({ id: 'out', amount: -40 })];
    expect(filterTransactions(txns, { ...ALL, type: 'income' }).map((t) => t.id)).toEqual(['in']);
    expect(filterTransactions(txns, { ...ALL, type: 'expense' }).map((t) => t.id)).toEqual(['out']);
  });

  it('excludes zero-amount transactions from both income and expense', () => {
    const txns = [tx({ id: 'zero', amount: 0 })];
    expect(filterTransactions(txns, { ...ALL, type: 'income' })).toHaveLength(0);
    expect(filterTransactions(txns, { ...ALL, type: 'expense' })).toHaveLength(0);
    expect(filterTransactions(txns, { ...ALL, type: 'all' })).toHaveLength(1);
  });

  it('combines filters (AND semantics)', () => {
    const txns = [
      tx({
        id: 'hit',
        amount: -10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'wrongCat',
        amount: -10,
        categoryId: 'cat-9',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'wrongType',
        amount: 10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'outOfRange',
        amount: -10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-01-01',
      }),
    ];
    const out = filterTransactions(txns, {
      from: '2026-05-01',
      to: '2026-05-31',
      categoryId: 'cat-1',
      query: 'mono',
      type: 'expense',
    });
    expect(out.map((t) => t.id)).toEqual(['hit']);
  });
});
