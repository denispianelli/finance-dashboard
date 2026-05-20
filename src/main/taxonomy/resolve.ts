import type { DatabaseSync } from 'node:sqlite';
import type {
  AggregationBucket,
  AggregationMode,
  MappingRule,
  ResolvedCategory,
} from '@shared/types/taxonomy';

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
  return resolveNow(db, categoryId, cat.name, new Set());
}

export function aggregateByCategory(
  db: DatabaseSync,
  options: { from: string; to: string; mode: AggregationMode },
): AggregationBucket[] {
  // Runtime guard for callers via untyped boundaries (IPC, JSON).
  // Cast to string so the check stays live under strict TS narrowing.
  const rawMode = options.mode as string;
  if (rawMode !== 'as_of_period' && rawMode !== 'as_of_now') {
    throw new Error('aggregateByCategory: mode is required (as_of_period | as_of_now)');
  }
  const txs = db
    .prepare(
      `SELECT id, date, amount, label_clean, category_id FROM transactions
       WHERE date >= ? AND date <= ? AND category_id IS NOT NULL`,
    )
    .all(options.from, options.to) as unknown as {
    id: string;
    date: string;
    amount: number;
    label_clean: string;
    category_id: string;
  }[];
  const buckets = new Map<string, AggregationBucket>();
  for (const tx of txs) {
    const routed = routeTransaction(db, tx, options.mode);
    const key = `${routed.id}::${routed.name}`;
    const prev = buckets.get(key) ?? {
      categoryId: routed.id,
      name: routed.name,
      total: 0,
      count: 0,
    };
    buckets.set(key, { ...prev, total: prev.total + tx.amount, count: prev.count + 1 });
  }
  return [...buckets.values()];
}

function routeTransaction(
  db: DatabaseSync,
  tx: { date: string; label_clean: string; category_id: string },
  mode: AggregationMode,
): { id: string; name: string } {
  if (mode === 'as_of_period') {
    const r = resolveCategoryAsOf(db, tx.category_id, 'as_of_period', tx.date);
    // as_of_period never returns splitInto per spec §5.2
    return { id: r.id, name: r.name };
  }
  // as_of_now — walk through chained splits per spec §6.2 step 4.
  let currentId = tx.category_id;
  let resolved = resolveCategoryAsOf(db, currentId, 'as_of_now');
  while ('splitInto' in resolved) {
    const splitEvent = db
      .prepare(
        "SELECT payload FROM taxonomy_events WHERE kind = 'split' AND json_extract(source_ids, '$[0]') = ? LIMIT 1",
      )
      .get(currentId) as unknown as { payload: string } | undefined;
    if (!splitEvent) {
      throw new Error(`aggregateByCategory: missing split event for ${currentId}`);
    }
    const rule = JSON.parse(splitEvent.payload) as MappingRule;
    const match = rule.rules.find((r) => compilePattern(r.pattern).test(tx.label_clean));
    if (!match) {
      throw new Error(
        `aggregateByCategory: exhaustive-rule invariant violated for ${currentId} (label="${tx.label_clean}")`,
      );
    }
    currentId = match.target_id;
    resolved = resolveCategoryAsOf(db, currentId, 'as_of_now');
  }
  return { id: resolved.id, name: resolved.name };
}

function resolvePeriod(
  db: DatabaseSync,
  categoryId: string,
  date: string,
  currentName: string,
): ResolvedCategory {
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

function resolveNow(
  db: DatabaseSync,
  categoryId: string,
  currentName: string,
  visited: Set<string>,
): ResolvedCategory {
  if (visited.has(categoryId)) {
    throw new Error(`resolveCategoryAsOf: cycle detected at ${categoryId}`);
  }
  visited.add(categoryId);
  const event = db
    .prepare(
      `SELECT kind, target_ids FROM taxonomy_events
       WHERE (kind = 'split' OR kind = 'merge')
         AND EXISTS (SELECT 1 FROM json_each(source_ids) WHERE value = ?)
       ORDER BY occurred_at ASC, event_seq ASC
       LIMIT 1`,
    )
    .get(categoryId) as unknown as { kind: string; target_ids: string } | undefined;
  if (!event) {
    return { id: categoryId, name: currentName };
  }
  const targetIds = JSON.parse(event.target_ids) as string[];
  if (event.kind === 'merge') {
    const targetId = targetIds[0];
    if (targetId === undefined) {
      throw new Error(`resolveCategoryAsOf: merge event with no target for ${categoryId}`);
    }
    const targetCat = db
      .prepare('SELECT name FROM categories WHERE id = ?')
      .get(targetId) as unknown as { name: string } | undefined;
    if (!targetCat) {
      throw new Error(`resolveCategoryAsOf: merge target ${targetId} not found`);
    }
    return resolveNow(db, targetId, targetCat.name, visited);
  }
  const splitInto = targetIds.map((tid) => {
    const r = resolveNow(db, tid, getName(db, tid), new Set(visited));
    return { id: r.id, name: r.name };
  });
  return { id: categoryId, name: currentName, splitInto };
}

/**
 * Compile a mapping-rule pattern (spec §3.3) into a RegExp.
 * Supports a leading `(?i)` PCRE-style flag for case-insensitive matching;
 * everything else is passed straight to the native RegExp constructor.
 */
function compilePattern(pattern: string): RegExp {
  if (pattern.startsWith('(?i)')) {
    return new RegExp(pattern.slice(4), 'i');
  }
  return new RegExp(pattern);
}

function getName(db: DatabaseSync, categoryId: string): string {
  const row = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) as unknown as
    | { name: string }
    | undefined;
  if (!row) {
    throw new Error(`resolveCategoryAsOf: split target ${categoryId} not found`);
  }
  return row.name;
}
