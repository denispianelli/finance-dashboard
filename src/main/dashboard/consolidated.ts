import type { DatabaseSync } from 'node:sqlite';
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { NOT_TRANSFER } from './transferFilter';

interface CashflowRow {
  period: string;
  income: number;
  expense: number;
}

/**
 * Income / expense / net across ALL accounts, grouped by calendar month
 * (`yyyy-mm`) or year (`yyyy`). Internal transfers (flagged or categorised as
 * `cat-transferts`) are excluded — they move your own money, they are neither
 * income nor spending. `expense` is negative or zero; `net = income + expense`.
 */
export function getConsolidatedCashflow(
  db: DatabaseSync,
  granularity: CashflowGranularity,
): CashflowPoint[] {
  const periodExpr = granularity === 'year' ? 'substr(date, 1, 4)' : 'substr(date, 1, 7)';
  const rows = db
    .prepare(
      `SELECT ${periodExpr} AS period,
              COALESCE(SUM(CASE WHEN amount >= 0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN amount <  0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       GROUP BY period
       ORDER BY period ASC`,
    )
    .all() as unknown as CashflowRow[];

  return rows.map((r) => ({
    period: r.period,
    income: r.income,
    expense: r.expense,
    net: r.income + r.expense,
  }));
}
