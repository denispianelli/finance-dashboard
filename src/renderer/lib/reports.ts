import type { CashflowPoint, DashboardTransaction } from '@shared/types/dashboard';

export interface CategoryShare {
  name: string;
  total: number;
}

/** Top spending categories across ALL given transactions (expenses, non-transfer,
 *  categorised), largest first. */
export function topCategories(txns: DashboardTransaction[], limit = 5): CategoryShare[] {
  const totals = new Map<string, number>();
  for (const tx of txns) {
    if (tx.amount >= 0) continue;
    if (tx.isInternalTransfer || tx.categoryId === 'cat-transferts') continue;
    if (tx.categoryName === null) continue;
    totals.set(tx.categoryName, (totals.get(tx.categoryName) ?? 0) + Math.abs(tx.amount));
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Savings rate over a cash-flow series: net / income, as a 0-100 percentage.
 *  Returns null when there is no income to divide by. */
export function savingsRate(series: CashflowPoint[]): number | null {
  const income = series.reduce((s, p) => s + p.income, 0);
  const net = series.reduce((s, p) => s + p.net, 0);
  if (income <= 0) return null;
  return (net / income) * 100;
}

export interface YearComparison {
  current: CashflowPoint;
  previous: CashflowPoint | null;
  netDelta: number | null;
}

/** Latest year vs the one before, from a year-granularity cash-flow series. */
export function yearOverYear(yearSeries: CashflowPoint[]): YearComparison | null {
  if (yearSeries.length === 0) return null;
  const sorted = [...yearSeries].sort((a, b) => a.period.localeCompare(b.period));
  const current = sorted[sorted.length - 1];
  if (current === undefined) return null;
  const previous = sorted[sorted.length - 2] ?? null;
  return { current, previous, netDelta: previous ? current.net - previous.net : null };
}

/** Largest movements by magnitude (non-transfer), most extreme first. */
export function biggestMovements(txns: DashboardTransaction[], limit = 5): DashboardTransaction[] {
  return [...txns]
    .filter((t) => !t.isInternalTransfer && t.categoryId !== 'cat-transferts')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);
}
