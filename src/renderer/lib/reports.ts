import type { CashflowPoint, DashboardTransaction, NetWorth } from '@shared/types/dashboard';
import { isTransferTx, isRefundTx } from './filterTransactions';

export interface CategoryShare {
  name: string;
  total: number;
}

/** A specific report period: a whole year (`value` = `yyyy`) or a month (`yyyy-mm`). */
export interface ReportPeriod {
  granularity: 'year' | 'month';
  value: string;
}

/** One point on the gained/lost area chart. */
export interface NetPoint {
  label: string;
  net: number;
}

const MONTHS_SHORT = [
  'janv',
  'févr',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sept',
  'oct',
  'nov',
  'déc',
];

/** A flow that counts toward the result: anything that is not a transfer.
 *  (Refunds still count here — they net against expenses, see periodTotals.) */
function counts(t: DashboardTransaction): boolean {
  return !isTransferTx(t);
}

/** Distinct years and months present in a month-granularity cash-flow series, newest first. */
export function availablePeriods(monthSeries: CashflowPoint[]): {
  years: string[];
  months: string[];
} {
  const years = new Set<string>();
  const months = new Set<string>();
  for (const p of monthSeries) {
    years.add(p.period.slice(0, 4));
    months.add(p.period);
  }
  const desc = (a: string, b: string): number => b.localeCompare(a);
  return { years: [...years].sort(desc), months: [...months].sort(desc) };
}

/** The 12 months of a year (Jan→Dec), net per month, zero-filled, from a month series. */
export function monthlyNetForYear(monthSeries: CashflowPoint[], year: string): NetPoint[] {
  const byMonth = new Map(monthSeries.map((p) => [p.period, p.net]));
  return MONTHS_SHORT.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { label, net: byMonth.get(key) ?? 0 };
  });
}

/** Transactions whose date falls in the period (date prefix match). */
export function txInPeriod(
  txns: DashboardTransaction[],
  period: ReportPeriod,
): DashboardTransaction[] {
  return txns.filter((t) => t.date.startsWith(period.value));
}

/**
 * Income / expense / net of a transaction set under the category-driven model:
 * transfers are excluded entirely; the net is everything else; income is the
 * positive non-refund flows; expense is the remainder (so refunds — positive
 * amounts tagged « Remboursement » — reduce the expense magnitude).
 */
export function periodTotals(txns: DashboardTransaction[]): {
  income: number;
  expense: number;
  net: number;
} {
  let income = 0;
  let net = 0;
  for (const t of txns) {
    if (!counts(t)) continue;
    net += t.amount;
    if (t.amount > 0 && !isRefundTx(t)) income += t.amount;
  }
  return { income, expense: net - income, net };
}

/** Cumulative net by day across the transactions of a month (`yyyy-mm`), transfers excluded. */
export function dailyCumulativeNet(txns: DashboardTransaction[], month: string): NetPoint[] {
  const byDay = new Map<string, number>();
  for (const t of txns) {
    if (!t.date.startsWith(month) || !counts(t)) continue;
    const day = t.date.slice(8, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
  }
  let running = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, delta]) => {
      running += delta;
      return { label: day, net: running };
    });
}

/** The period verdict: income, spend, net (with sign), savings rate, and the
 *  net change vs the comparable previous period. Feeds the three hero pastilles. */
export interface PeriodVerdict {
  income: number;
  expense: number;
  net: number;
  positive: boolean;
  savingsRate: number | null;
  deltaPct: number | null;
}

export function periodVerdict(
  scoped: DashboardTransaction[],
  prev: DashboardTransaction[],
): PeriodVerdict {
  const t = periodTotals(scoped);
  const prevNet = periodTotals(prev).net;
  return {
    income: t.income,
    expense: t.expense,
    net: t.net,
    positive: t.net >= 0,
    savingsRate: t.income > 0 ? (t.net / t.income) * 100 : null,
    deltaPct: prevNet > 0 ? ((t.net - prevNet) / Math.abs(prevNet)) * 100 : null,
  };
}

/** Account balances as donut slices (drops null/non-positive balances). */
export interface CompositionSlice {
  name: string;
  value: number;
}

export function accountComposition(netWorth: NetWorth | null): CompositionSlice[] {
  if (netWorth === null) return [];
  return netWorth.accounts
    .filter((a): a is typeof a & { balance: number } => a.balance !== null && a.balance > 0)
    .map((a) => ({ name: a.name, value: a.balance }));
}

/** The comparable previous period: previous year, or the same month one year earlier. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  if (period.granularity === 'year') {
    return { granularity: 'year', value: String(Number(period.value) - 1) };
  }
  const year = Number(period.value.slice(0, 4)) - 1;
  return { granularity: 'month', value: `${String(year)}-${period.value.slice(5, 7)}` };
}

/** Top spending categories across ALL given transactions (expenses, non-transfer,
 *  categorised), largest first. */
export function topCategories(txns: DashboardTransaction[], limit = 5): CategoryShare[] {
  const totals = new Map<string, number>();
  for (const tx of txns) {
    if (tx.amount >= 0) continue;
    if (isTransferTx(tx) || isRefundTx(tx)) continue;
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
    .filter((t) => !isTransferTx(t) && !isRefundTx(t))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);
}

/**
 * The flows behind a verdict figure, largest first. Transfers are always
 * excluded. `'in'` = income (positive, non-refund); `'out'` = the expense side
 * (spends *and* refunds, so the refund lines show as the credits that reduce the
 * total); no sign = the whole net set.
 */
export function countableTransactions(
  txns: DashboardTransaction[],
  sign?: 'in' | 'out',
): DashboardTransaction[] {
  return txns
    .filter((t) => {
      if (isTransferTx(t)) return false;
      if (sign === 'in') return t.amount > 0 && !isRefundTx(t);
      if (sign === 'out') return t.amount < 0 || isRefundTx(t);
      return true;
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
