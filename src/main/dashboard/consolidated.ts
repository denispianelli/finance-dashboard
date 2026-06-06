import type { DatabaseSync } from 'node:sqlite';
import type { CashflowGranularity, CashflowPoint, NetWorth } from '@shared/types/dashboard';
import { INCOME_ROW, EXPENSE_ROW } from './transferFilter';
import { getAccountSummaries } from './queries';

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
              COALESCE(SUM(CASE WHEN ${INCOME_ROW} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN ${EXPENSE_ROW} THEN amount ELSE 0 END), 0) AS expense
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

/**
 * Consolidated net worth: the sum of every account's real balance (ADR-014).
 * Unanchored accounts carry `balance: null` and contribute 0 to the total; they
 * are still listed so the UI can surface "declare a balance" (brick F2). No
 * market valuation, no network — balances come only from imported statements.
 */
export function getNetWorth(db: DatabaseSync): NetWorth {
  const accounts = getAccountSummaries(db);
  const total = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  return {
    total,
    accounts: accounts.map((a) => ({ accountId: a.id, name: a.name, balance: a.balance })),
  };
}
