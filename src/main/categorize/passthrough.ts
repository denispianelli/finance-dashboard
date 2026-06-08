import type { DatabaseSync } from 'node:sqlite';
import { stableLabelKey } from './labelKey';

/** Payees that settle unrelated purchases under one identical label — categorized
 *  by amount, never by label. Matched as whole tokens (a label key is uppercase and
 *  space-separated), so distinctive names only: no first names / short tokens. */
const PASSTHROUGH_SEED = new Set(['PAYPAL', 'SUMUP', 'LEETCHI']);

function matchesSeed(labelKey: string): boolean {
  return labelKey.split(' ').some((token) => PASSTHROUGH_SEED.has(token));
}

/**
 * Build a predicate telling whether a label key (stableLabelKey output) is a
 * passthrough payee: a seed token (cold-start) OR a key the user has filed under
 * >=2 distinct categories (self-tuning). The entropy map is computed once from the
 * user-categorized rows and reused across the pass.
 */
export function buildPassthroughDetector(db: DatabaseSync): (labelKey: string) => boolean {
  const rows = db
    .prepare(
      `SELECT label_clean, category_id FROM transactions
        WHERE user_modified = 1 AND category_id IS NOT NULL`,
    )
    .all() as unknown as { label_clean: string; category_id: string }[];

  const cats = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = stableLabelKey(r.label_clean);
    let set = cats.get(key);
    if (set === undefined) {
      set = new Set<string>();
      cats.set(key, set);
    }
    set.add(r.category_id);
  }

  return (labelKey: string): boolean =>
    matchesSeed(labelKey) || (cats.get(labelKey)?.size ?? 0) >= 2;
}
