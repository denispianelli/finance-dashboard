import type { DatabaseSync } from 'node:sqlite';
import type { CategorizeItem, PendingGroup } from '@shared/types/import';
import { stableLabelKey } from './labelKey';

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

/**
 * Pending transactions grouped by their stable label key (see stableLabelKey).
 * Each distinct label is one group, so the LLM classifies it once and the result
 * fans out to all rows sharing it — killing the per-row inconsistency we measured.
 * Oldest-first: the representative `label` is the oldest row's faithful label_raw.
 */
export function listPendingGroups(db: DatabaseSync): PendingGroup[] {
  const rows = db
    .prepare(
      `SELECT id, label_raw, label_clean
         FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0
        ORDER BY date ASC, rowid ASC`,
    )
    .all() as unknown as { id: string; label_raw: string; label_clean: string }[];

  const groups = new Map<string, PendingGroup>();
  for (const r of rows) {
    const key = stableLabelKey(r.label_clean);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { key, label: r.label_raw, count: 1 });
  }
  return [...groups.values()];
}

/**
 * Apply an LLM-suggested category to every *still-uncategorized* row whose stable
 * key matches `key`. stableLabelKey (JS) is the single source of grouping truth —
 * exact, unlike a SQL substring match. `user_modified` stays 0 (auto), so the
 * history tier reuses it on the next import; no rule is created. Returns the count.
 */
export function applyCategoryToKey(db: DatabaseSync, key: string, categoryId: string): number {
  const rows = db
    .prepare(
      `SELECT id, label_clean FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0`,
    )
    .all() as unknown as { id: string; label_clean: string }[];

  const ids = rows.filter((r) => stableLabelKey(r.label_clean) === key).map((r) => r.id);
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const res = db
    .prepare(
      `UPDATE transactions SET category_id = ?
        WHERE id IN (${placeholders}) AND category_id IS NULL`,
    )
    .run(categoryId, ...ids);
  return Number(res.changes);
}
