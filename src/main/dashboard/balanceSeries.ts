import type { DatabaseSync } from 'node:sqlite';
import type { BalancePoint, ChartRange } from '@shared/types/dashboard';

const MONTHS_BY_RANGE: Record<Exclude<ChartRange, '3m' | 'max'>, number> = {
  '6m': 6,
  '1y': 12,
};

interface PeriodRow {
  period: string;
  delta: number;
}

/**
 * Balance-over-time series for the dashboard chart.
 *
 * The balance is the true cash position (all amounts, transfers included),
 * cumulative over the account's FULL history; the window only trims which
 * points are returned. `3m` buckets per day, the other ranges per month.
 * The `3m` window is anchored on the latest transaction date (not today),
 * so the chart stays meaningful when imports lag.
 */
export function getBalanceSeries(
  db: DatabaseSync,
  accountId: string,
  range: ChartRange,
): BalancePoint[] {
  const periodExpr = range === '3m' ? 'date' : 'substr(date, 1, 7)';
  const rows = db
    .prepare(
      `SELECT ${periodExpr} AS period, COALESCE(SUM(amount), 0) AS delta
       FROM transactions
       WHERE account_id = ?
       GROUP BY period
       ORDER BY period ASC`,
    )
    .all(accountId) as unknown as PeriodRow[];

  let running = 0;
  const all: BalancePoint[] = rows.map((r) => {
    running += r.delta;
    return { period: r.period, balance: running };
  });

  if (range === 'max') return all;
  if (range === '3m') {
    const last = all.at(-1);
    if (!last) return [];
    return all.filter((p) => p.period >= shiftMonths(last.period, -3));
  }
  return all.slice(-MONTHS_BY_RANGE[range]);
}

/**
 * Shift a `yyyy-mm-dd` date by whole months, keeping the day as-is. The result
 * may be a non-existent date (e.g. `2026-02-31`) — fine here, it is only used
 * as a lexicographic comparison cutoff, never parsed.
 */
function shiftMonths(date: string, by: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const total = year * 12 + (month - 1) + by;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}${date.slice(7)}`;
}
