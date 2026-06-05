import type { DatabaseSync } from 'node:sqlite';
import type { CategorizeItem } from '@shared/types/import';

/**
 * Transactions awaiting a category: `category_id IS NULL` and not flagged as an
 * internal transfer (those are deliberately uncategorized). Returned oldest-first
 * so a long backlog categorizes in a stable order. `label_raw` is the faithful
 * extracted label the LLM reads.
 */
export function listUncategorized(db: DatabaseSync): CategorizeItem[] {
  const rows = db
    .prepare(
      `SELECT id, label_raw
         FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0
        ORDER BY date ASC, rowid ASC`,
    )
    .all() as unknown as { id: string; label_raw: string }[];
  return rows.map((r) => ({ id: r.id, label: r.label_raw }));
}

/**
 * Write an LLM-suggested category, but only if the row is still uncategorized —
 * so a manual pick made meanwhile is never overwritten. `user_modified` stays 0
 * (auto), which lets the history tier reuse this label on the next import.
 * Returns true if a row was updated.
 */
export function applyCategory(db: DatabaseSync, id: string, categoryId: string): boolean {
  const res = db
    .prepare('UPDATE transactions SET category_id = ? WHERE id = ? AND category_id IS NULL')
    .run(categoryId, id);
  return res.changes > 0;
}
