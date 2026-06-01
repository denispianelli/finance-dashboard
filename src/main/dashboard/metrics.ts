import type { DatabaseSync } from 'node:sqlite';
import type { DashboardMetrics, MonthPoint } from '@shared/types/dashboard';

const MAX_SERIES_MONTHS = 12;

interface MonthRow {
  month: string;
  income: number;
  expense: number;
}

/**
 * Account-level metrics for the dashboard: the net balance and a monthly series
 * (income / expense / net + running end-of-month balance) for up to the last 12
 * active months. The running balance is cumulative over the account's full
 * history, so the series reflects the true trajectory even when sliced to 12.
 */
export function getDashboardMetrics(db: DatabaseSync, accountId: string): DashboardMetrics {
  const rows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN amount <  0 THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       WHERE account_id = ?
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all(accountId) as unknown as MonthRow[];

  let running = 0;
  const all: MonthPoint[] = rows.map((r) => {
    const net = r.income + r.expense;
    running += net;
    return { month: r.month, income: r.income, expense: r.expense, net, balance: running };
  });

  return {
    balance: running,
    series: all.slice(-MAX_SERIES_MONTHS),
  };
}
