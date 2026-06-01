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
  balance: number;
  tx_count: number;
}

/** All accounts with their net balance and transaction count (accounts with no
 *  transactions are included via the LEFT JOIN, with balance 0). */
export function getAccountSummaries(db: DatabaseSync): AccountSummary[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.bank_id, a.currency,
              COALESCE(SUM(t.amount), 0) AS balance,
              COUNT(t.id) AS tx_count
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       GROUP BY a.id
       ORDER BY a.created_at ASC, a.name ASC`,
    )
    .all() as unknown as AccountRow[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    bankId: r.bank_id,
    currency: r.currency,
    balance: r.balance,
    txCount: r.tx_count,
  }));
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
  confidence: number | null;
  is_internal_transfer: number;
  user_modified: number;
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
              c.icon AS category_icon, t.confidence,
              t.is_internal_transfer, t.user_modified
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
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
    confidence: r.confidence,
    isInternalTransfer: r.is_internal_transfer === 1,
    userModified: r.user_modified === 1,
  }));
}
