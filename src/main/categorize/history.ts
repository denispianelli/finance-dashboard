import type { DatabaseSync } from 'node:sqlite';
import { stableLabelKey } from './labelKey';

/**
 * Cascade level 2 (design §7): if a similar label has been seen before and
 * categorized, reuse that category. Lookups are keyed on `stableLabelKey`, not the
 * exact `label_clean` — labels embedding a date or reference never repeat exactly,
 * so exact matching let user corrections die with the one row they were made on
 * (audit #184). A user-corrected categorization (user_modified) wins over an
 * auto-applied one; ties break on frequency.
 *
 * Built once per import pass (same point-in-time snapshot pattern as
 * buildPassthroughDetector) and queried per transaction.
 */
export interface HistoryIndex {
  /** Learned category for a label key, or null. */
  byLabel(labelKey: string): string | null;
  /** Learned category for a label key + exact amount (to the cent), or null.
   *  For passthrough payees (PayPal…) the label is ambiguous but a recurring
   *  amount is reliable: (PAYPAL, 17.20) -> Abonnements. */
  byLabelAmount(labelKey: string, amount: number): string | null;
}

interface CategoryStats {
  userModified: number;
  count: number;
}

function bump(
  index: Map<string, Map<string, CategoryStats>>,
  key: string,
  categoryId: string,
  userModified: number,
): void {
  let cats = index.get(key);
  if (cats === undefined) {
    cats = new Map<string, CategoryStats>();
    index.set(key, cats);
  }
  const stats = cats.get(categoryId);
  if (stats === undefined) {
    cats.set(categoryId, { userModified, count: 1 });
  } else {
    stats.userModified = Math.max(stats.userModified, userModified);
    stats.count += 1;
  }
}

/** Highest (user_modified, count) wins — same ordering the previous SQL used. */
function best(cats: Map<string, CategoryStats> | undefined): string | null {
  if (cats === undefined) return null;
  let bestId: string | null = null;
  let bestStats: CategoryStats | null = null;
  for (const [id, stats] of cats) {
    if (
      bestStats === null ||
      stats.userModified > bestStats.userModified ||
      (stats.userModified === bestStats.userModified && stats.count > bestStats.count)
    ) {
      bestId = id;
      bestStats = stats;
    }
  }
  return bestId;
}

function amountKey(labelKey: string, amount: number): string {
  return `${labelKey} ${String(Math.round(amount * 100))}`;
}

export function buildHistoryIndex(db: DatabaseSync): HistoryIndex {
  const rows = db
    .prepare(
      `SELECT label_clean, amount, category_id, user_modified
         FROM transactions
        WHERE category_id IS NOT NULL`,
    )
    .all() as unknown as {
    label_clean: string;
    amount: number;
    category_id: string;
    user_modified: number;
  }[];

  const byLabel = new Map<string, Map<string, CategoryStats>>();
  const byLabelAmount = new Map<string, Map<string, CategoryStats>>();
  for (const r of rows) {
    const key = stableLabelKey(r.label_clean);
    bump(byLabel, key, r.category_id, r.user_modified);
    bump(byLabelAmount, amountKey(key, r.amount), r.category_id, r.user_modified);
  }

  return {
    byLabel: (labelKey) => best(byLabel.get(labelKey)),
    byLabelAmount: (labelKey, amount) => best(byLabelAmount.get(amountKey(labelKey, amount))),
  };
}
