import type { DatabaseSync } from 'node:sqlite';
import type { DashboardMetrics, MonthPoint } from '@shared/types/dashboard';

const MAX_SERIES_MONTHS = 12;

/** The internal-transfers category (seeded). Used to keep transfers out of the
 *  income/expense figures — they move your own money, they aren't earning/spending. */
const TRANSFER_CATEGORY = 'cat-transferts';

/** A transaction that is NOT an internal transfer. Written explicitly (rather
 *  than NOT(...)) to avoid SQLite three-valued logic when category_id is NULL. */
const NOT_TRANSFER = `is_internal_transfer = 0 AND (category_id IS NULL OR category_id != '${TRANSFER_CATEGORY}')`;

interface MonthRow {
  month: string;
  income: number;
  expense: number;
  delta: number;
}

/**
 * Account-level metrics for the dashboard.
 *
 * - income / expense / net EXCLUDE internal transfers (a transfer between your
 *   own accounts isn't earning or spending), so month-over-month comparisons
 *   reflect real income and spending.
 * - balance is the true cash position: it sums ALL movements, transfers included,
 *   cumulatively over the account's full history (the series is then sliced to 12).
 */
export function getDashboardMetrics(db: DatabaseSync, accountId: string): DashboardMetrics {
  const rows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN amount >= 0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN amount <  0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS expense,
              COALESCE(SUM(amount), 0) AS delta
       FROM transactions
       WHERE account_id = ?
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all(accountId) as unknown as MonthRow[];

  let running = 0;
  const all: MonthPoint[] = rows.map((r) => {
    running += r.delta;
    return {
      month: r.month,
      income: r.income,
      expense: r.expense,
      net: r.income + r.expense,
      balance: running,
    };
  });

  return {
    balance: running,
    series: all.slice(-MAX_SERIES_MONTHS),
  };
}
