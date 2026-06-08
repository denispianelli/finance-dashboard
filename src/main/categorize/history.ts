import type { DatabaseSync } from 'node:sqlite';

/**
 * Cascade level 2 (design §7): if this label has been seen before and
 * categorized, reuse that category. A user-corrected categorization
 * (user_modified) wins over an auto-applied one; ties break on frequency.
 * This is how manual corrections propagate to future imports — no rules to manage.
 *
 * `labelClean` must be the normalized label (see normalizeLabel).
 */
export function findHistoryCategory(db: DatabaseSync, labelClean: string): string | null {
  const row = db
    .prepare(
      `SELECT category_id
       FROM transactions
       WHERE label_clean = ? AND category_id IS NOT NULL
       GROUP BY category_id
       ORDER BY MAX(user_modified) DESC, COUNT(*) DESC
       LIMIT 1`,
    )
    .get(labelClean) as unknown as { category_id: string } | undefined;
  return row?.category_id ?? null;
}

/**
 * Like findHistoryCategory but matched on label_clean AND the exact amount (to the
 * cent). For passthrough payees (PayPal…) the label is ambiguous but a recurring
 * amount is reliable: (PayPal, 17.20) -> Abonnements. user_modified wins; ties on
 * frequency. Cent-rounded comparison avoids float-equality pitfalls.
 */
export function findAmountHistoryCategory(
  db: DatabaseSync,
  labelClean: string,
  amount: number,
): string | null {
  const cents = Math.round(amount * 100);
  const row = db
    .prepare(
      `SELECT category_id
         FROM transactions
        WHERE label_clean = ?
          AND CAST(ROUND(amount * 100) AS INTEGER) = ?
          AND category_id IS NOT NULL
        GROUP BY category_id
        ORDER BY MAX(user_modified) DESC, COUNT(*) DESC
        LIMIT 1`,
    )
    .get(labelClean, cents) as unknown as { category_id: string } | undefined;
  return row?.category_id ?? null;
}
