import type { DatabaseSync } from 'node:sqlite';
import type { AggregationMode, ResolvedCategory } from '@shared/types/taxonomy';

export function resolveCategoryAsOf(
  db: DatabaseSync,
  categoryId: string,
  mode: AggregationMode,
  date?: string,
): ResolvedCategory {
  const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) as unknown as
    | { name: string }
    | undefined;
  if (!cat) {
    throw new Error(`resolveCategoryAsOf: category ${categoryId} not found`);
  }
  if (mode === 'as_of_period') {
    if (date === undefined) {
      throw new Error('resolveCategoryAsOf: date is required when mode is as_of_period');
    }
    return resolvePeriod(db, categoryId, date, cat.name);
  }
  return { id: categoryId, name: cat.name };
}

function resolvePeriod(
  db: DatabaseSync,
  categoryId: string,
  date: string,
  currentName: string,
): ResolvedCategory {
  // §5.2 — most recent rename at or before `date` wins
  const renameLe = db
    .prepare(
      `SELECT payload FROM taxonomy_events
       WHERE kind = 'rename'
         AND json_extract(source_ids, '$[0]') = ?
         AND occurred_at <= ?
       ORDER BY occurred_at DESC, event_seq DESC
       LIMIT 1`,
    )
    .get(categoryId, date) as unknown as { payload: string } | undefined;
  if (renameLe) {
    const payload = JSON.parse(renameLe.payload) as { new_name: string };
    return { id: categoryId, name: payload.new_name };
  }
  // No rename ≤ date. If a rename > date exists, the name at `date` was that
  // event's `old_name`. Otherwise the category was never renamed and current
  // name is also the name at `date`.
  const renameGt = db
    .prepare(
      `SELECT payload FROM taxonomy_events
       WHERE kind = 'rename'
         AND json_extract(source_ids, '$[0]') = ?
         AND occurred_at > ?
       ORDER BY occurred_at ASC, event_seq ASC
       LIMIT 1`,
    )
    .get(categoryId, date) as unknown as { payload: string } | undefined;
  if (renameGt) {
    const payload = JSON.parse(renameGt.payload) as { old_name: string };
    return { id: categoryId, name: payload.old_name };
  }
  return { id: categoryId, name: currentName };
}
