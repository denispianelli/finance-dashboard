import type { CashflowPoint, DashboardTransaction, NetWorth } from '@shared/types/dashboard';
import { isTransferTx, isRefundTx } from './filterTransactions';
import { toAccountingRows } from './loanSplit';

export interface CategoryShare {
  name: string;
  total: number;
}

/** A donut slice: a category's share of income or expenses, with its colour. */
export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/** A specific report period: a whole year (`value` = `yyyy`) or a month (`yyyy-mm`). */
export interface ReportPeriod {
  granularity: 'year' | 'month';
  value: string;
}

/** One bucket (month or day) of paired flows for the income-vs-expense bars.
 *  `expense` is a magnitude (≥ 0), so both bars grow upward from the baseline. */
export interface MonthlyFlow {
  label: string;
  income: number;
  expense: number;
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

/** The months of a year (Jan→Dec) with income & expense magnitude, trimmed to the
 *  populated range so the bars fill the chart (leading/trailing empty months — e.g.
 *  the future months of the current year — are dropped; empty months *between* data
 *  are kept). Returns `[]` when the year has no activity. */
export function monthlyFlowForYear(monthSeries: CashflowPoint[], year: string): MonthlyFlow[] {
  const byMonth = new Map(monthSeries.map((p) => [p.period, p]));
  const all = MONTHS_SHORT.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const p = byMonth.get(key);
    return { label, income: p?.income ?? 0, expense: Math.abs(p?.expense ?? 0) };
  });
  const has = (m: MonthlyFlow): boolean => m.income > 0 || m.expense > 0;
  const first = all.findIndex(has);
  if (first === -1) return [];
  let last = first;
  all.forEach((m, i) => {
    if (has(m)) last = i;
  });
  return all.slice(first, last + 1);
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
  for (const t of txns.flatMap(toAccountingRows)) {
    if (!counts(t)) continue;
    net += t.amount;
    if (t.amount > 0 && !isRefundTx(t)) income += t.amount;
  }
  return { income, expense: net - income, net };
}

/** Per-day income & expense magnitude across every day of a month (`yyyy-mm`),
 *  zero-filled and transfers excluded, so the bars are continuous like the kit.
 *  Labels are sparse (day 1 and every 5th) to avoid crowding the axis. */
export function dailyFlow(txns: DashboardTransaction[], month: string): MonthlyFlow[] {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const byDay = new Map<number, { income: number; expense: number }>();
  for (const t of txns.flatMap(toAccountingRows)) {
    if (!t.date.startsWith(month) || !counts(t)) continue;
    const day = Number(t.date.slice(8, 10));
    const e = byDay.get(day) ?? { income: 0, expense: 0 };
    if (t.amount >= 0) e.income += t.amount;
    else e.expense += -t.amount;
    byDay.set(day, e);
  }
  const out: MonthlyFlow[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const e = byDay.get(day) ?? { income: 0, expense: 0 };
    out.push({
      label: day === 1 || day % 5 === 0 ? String(day) : '',
      income: e.income,
      expense: e.expense,
    });
  }
  return out;
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
  for (const tx of txns.flatMap(toAccountingRows)) {
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

/** Income (`'in'`) or expense (`'out'`) broken down by category, as donut slices
 *  (magnitudes, largest first). Transfers and refunds are excluded; uncategorised
 *  flows fall under « Non catégorisé ». Categories beyond `limit` collapse into
 *  « Autres » so the donut stays readable. */
export function categoryBreakdown(
  txns: DashboardTransaction[],
  sign: 'in' | 'out',
  limit = 6,
): DonutSlice[] {
  const NEUTRAL = '#6E6E78';
  const map = new Map<string, { value: number; color: string }>();
  for (const t of txns.flatMap(toAccountingRows)) {
    if (isTransferTx(t) || isRefundTx(t)) continue;
    if (sign === 'in' ? t.amount <= 0 : t.amount >= 0) continue;
    const name = t.categoryName ?? 'Non catégorisé';
    const entry = map.get(name);
    if (entry) entry.value += Math.abs(t.amount);
    else map.set(name, { value: Math.abs(t.amount), color: t.categoryColor ?? NEUTRAL });
  }
  const all = [...map.entries()]
    .map(([name, v]) => ({ name, value: v.value, color: v.color }))
    .sort((a, b) => b.value - a.value);
  if (all.length <= limit) return all;
  const rest = all.slice(limit).reduce((s, x) => s + x.value, 0);
  return [...all.slice(0, limit), { name: 'Autres', value: rest, color: NEUTRAL }];
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
