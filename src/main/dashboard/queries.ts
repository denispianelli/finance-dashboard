import type { DatabaseSync } from 'node:sqlite';
import type {
  AccountSummary,
  DashboardTransaction,
  GetTransactionsQuery,
} from '@shared/types/dashboard';

const DEFAULT_TX_LIMIT = 100;

interface AccountRow {
  id: string;
  name: string;
  type: string;
  bank_id: string | null;
  currency: string;
  anchor_balance: number | null;
  later_sum: number;
  has_anchor: number;
  declared_balance: number | null;
  tx_count: number;
}

/**
 * All accounts with their real balance and transaction count (ADR-014).
 *
 * The balance is anchored on the most recent statement that carries a closing
 * balance (the import with the greatest `closing_balance_date`, ties broken by
 * `imported_at`), plus any transactions dated strictly after that anchor date.
 * That closing balance already incorporates the full history up to its date, so
 * the figure is robust to gaps in the imported history. An account that no
 * statement anchors gets a `null` balance (the UI shows "—") rather than a
 * misleading sum of movements.
 */
export function getAccountSummaries(db: DatabaseSync): AccountSummary[] {
  const rows = db
    .prepare(
      `WITH ranked AS (
         SELECT account_id, closing_balance, closing_balance_date,
                ROW_NUMBER() OVER (
                  PARTITION BY account_id
                  ORDER BY closing_balance_date DESC, imported_at DESC
                ) AS rn
         FROM imports
         WHERE status = 'validated' AND closing_balance IS NOT NULL
       ),
       anchor AS (
         SELECT account_id, closing_balance, closing_balance_date
         FROM ranked WHERE rn = 1
       )
       SELECT a.id, a.name, a.type, a.bank_id, a.currency, a.declared_balance,
              (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS tx_count,
              an.closing_balance AS anchor_balance,
              (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                 WHERE t.account_id = a.id AND t.date > an.closing_balance_date) AS later_sum,
              CASE WHEN an.account_id IS NULL THEN 0 ELSE 1 END AS has_anchor
       FROM accounts a
       LEFT JOIN anchor an ON an.account_id = a.id
       ORDER BY a.created_at ASC, a.name ASC`,
    )
    .all() as unknown as AccountRow[];

  return rows.map((r) => {
    const base = {
      id: r.id,
      name: r.name,
      type: r.type,
      bankId: r.bank_id,
      currency: r.currency,
      txCount: r.tx_count,
    };
    if (r.has_anchor === 1) {
      return {
        ...base,
        balance: (r.anchor_balance ?? 0) + r.later_sum,
        balanceSource: 'statement',
      };
    }
    if (r.declared_balance !== null) {
      return { ...base, balance: r.declared_balance, balanceSource: 'declared' };
    }
    return { ...base, balance: null, balanceSource: null };
  });
}

interface TransactionRow {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  label_raw: string;
  label_clean: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  original_date: string | null;
  original_amount: number | null;
  edited_at: string | null;
  is_internal_transfer: number;
  user_modified: number;
  loan_installment_id: string | null;
  li_interest: number | null;
  li_insurance: number | null;
}

/** Transactions joined with their current category, newest first, capped by
 *  `limit` (default 100). Optional account / date-range filters. */
export function getTransactions(
  db: DatabaseSync,
  query: GetTransactionsQuery = {},
): DashboardTransaction[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.accountId !== undefined) {
    conditions.push('t.account_id = ?');
    params.push(query.accountId);
  }
  if (query.from !== undefined) {
    conditions.push('t.date >= ?');
    params.push(query.from);
  }
  if (query.to !== undefined) {
    conditions.push('t.date <= ?');
    params.push(query.to);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(query.limit ?? DEFAULT_TX_LIMIT);

  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, t.date, t.amount, t.label_raw, t.label_clean,
              t.category_id, c.name AS category_name, c.color AS category_color,
              c.icon AS category_icon,
              t.original_date, t.original_amount, t.edited_at,
              t.is_internal_transfer, t.user_modified,
              t.loan_installment_id,
              li.interest AS li_interest, li.insurance AS li_insurance
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN loan_installments li ON li.id = t.loan_installment_id
       ${whereSql}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`,
    )
    .all(...params) as unknown as TransactionRow[];

  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    date: r.date,
    amount: r.amount,
    labelRaw: r.label_raw,
    labelClean: r.label_clean,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    categoryIcon: r.category_icon,
    originalDate: r.original_date,
    originalAmount: r.original_amount,
    editedAt: r.edited_at,
    isInternalTransfer: r.is_internal_transfer === 1,
    userModified: r.user_modified === 1,
    loanSplit:
      r.loan_installment_id !== null && r.li_interest !== null && r.li_insurance !== null
        ? {
            interestInsurance: Math.round((r.li_interest + r.li_insurance) * 100) / 100,
            capital: Math.max(
              0,
              Math.round((Math.abs(r.amount) - (r.li_interest + r.li_insurance)) * 100) / 100,
            ),
          }
        : null,
  }));
}
