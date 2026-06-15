import type { DatabaseSync } from 'node:sqlite';
import type { CashflowGranularity, CashflowPoint, NetWorth } from '@shared/types/dashboard';
import { INCOME_ROW, EXPENSE_ROW } from './transferFilter';
import { getAccountSummaries } from './queries';
import { listLoans } from '../patrimoine/loanRepo';
import { listAssets } from '../patrimoine/assetRepo';
import { listSupportRows } from '../investment/investmentRepo';

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
              COALESCE(SUM(CASE
                WHEN loan_installment_id IS NULL AND ${INCOME_ROW} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE
                WHEN loan_installment_id IS NOT NULL THEN -(li.interest + li.insurance)
                WHEN ${EXPENSE_ROW} THEN amount
                ELSE 0 END), 0) AS expense
       FROM transactions t
       LEFT JOIN loan_installments li ON li.id = t.loan_installment_id
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
 * Consolidated net worth: accounts + declared assets − loan CRD (ADR-009
 * Amendment 2; account balances per ADR-014).
 * Unanchored accounts carry `balance: null` and contribute 0 to the total; they
 * are still listed so the UI can surface "declare a balance" (brick F2). Loans
 * and declared assets are folded in at the maintainer's share (`share` column).
 * No market valuation, no network.
 */
export function getNetWorth(db: DatabaseSync): NetWorth {
  const accounts = getAccountSummaries(db);
  const accountsTotal = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const loans = listLoans(db, todayIso).map((l) => ({
    loanId: l.id,
    name: l.name,
    crd: l.crd,
    share: l.share,
    contribution: round2(-l.crd * l.share),
  }));
  const assets = listAssets(db).map((a) => ({
    assetId: a.id,
    name: a.name,
    value: a.declaredValue,
    share: a.share,
    contribution: round2(a.declaredValue * a.share),
  }));
  const supports = listSupportRows(db).map((s) => ({
    supportId: s.id,
    name: s.name,
    value: round2(s.currentValue),
  }));

  const total = round2(
    accountsTotal +
      assets.reduce((s, a) => s + a.contribution, 0) +
      loans.reduce((s, l) => s + l.contribution, 0) +
      supports.reduce((s, x) => s + x.value, 0),
  );

  return {
    total,
    accounts: accounts.map((a) => ({ accountId: a.id, name: a.name, balance: a.balance })),
    assets,
    loans,
    supports,
  };
}
