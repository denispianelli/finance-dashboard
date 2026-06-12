import { writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

export interface JsonExport {
  formatVersion: 1;
  exportedAt: string;
  accounts: { id: string; name: string; type: string; currency: string }[];
  categories: { id: string; parentId: string | null; name: string }[];
  transactions: {
    id: string;
    account: string;
    date: string;
    amount: number;
    labelRaw: string;
    labelClean: string;
    /** Resolved category NAME (spec §4) — null when uncategorized. */
    category: string | null;
    isInternalTransfer: boolean;
    userModified: boolean;
  }[];
}

interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
}

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
}

interface TxRow {
  id: string;
  account: string;
  date: string;
  amount: number;
  label_raw: string;
  label_clean: string;
  category: string | null;
  is_internal_transfer: number;
  user_modified: number;
}

/** Read-only flat export for long-term human readability. The app never reads it back. */
export function buildJsonExport(db: DatabaseSync, now: Date = new Date()): JsonExport {
  const accounts = db
    .prepare('SELECT id, name, type, currency FROM accounts ORDER BY name, id')
    .all() as unknown as AccountRow[];

  const categories = (
    db
      .prepare('SELECT id, parent_id, name FROM categories ORDER BY position, name, id')
      .all() as unknown as CategoryRow[]
  ).map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name }));

  const transactions = (
    db
      .prepare(
        `SELECT t.id, a.name AS account, t.date, t.amount, t.label_raw, t.label_clean,
                c.name AS category, t.is_internal_transfer, t.user_modified
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           LEFT JOIN categories c ON c.id = t.category_id
          ORDER BY t.date, t.id`,
      )
      .all() as unknown as TxRow[]
  ).map((t) => ({
    id: t.id,
    account: t.account,
    date: t.date,
    amount: t.amount,
    labelRaw: t.label_raw,
    labelClean: t.label_clean,
    category: t.category,
    isInternalTransfer: t.is_internal_transfer === 1,
    userModified: t.user_modified === 1,
  }));

  return { formatVersion: 1, exportedAt: now.toISOString(), accounts, categories, transactions };
}

export function writeJsonExport(db: DatabaseSync, destPath: string): void {
  writeFileSync(destPath, JSON.stringify(buildJsonExport(db), null, 2));
}
