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
    // §5.2 — walk renames added in Task 2
    return { id: categoryId, name: cat.name };
  }
  // §5.3 as_of_now — chained logic added in Tasks 4-5
  return { id: categoryId, name: cat.name };
}
