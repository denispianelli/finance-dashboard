import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { MappingRule } from '@shared/types/taxonomy';

export function splitCategory(
  db: DatabaseSync,
  payload: { sourceId: string; targetIds: string[]; mappingRule: MappingRule },
): string {
  if (payload.targetIds.length < 2) {
    throw new Error('splitCategory: at least 2 targets required');
  }
  const lastRule = payload.mappingRule.rules[payload.mappingRule.rules.length - 1];
  if (lastRule?.pattern !== '.*') {
    throw new Error(
      'splitCategory: mapping rule must be exhaustive — last rule pattern must be ".*"',
    );
  }
  const targetSet = new Set(payload.targetIds);
  for (const r of payload.mappingRule.rules) {
    if (!targetSet.has(r.target_id)) {
      throw new Error(`splitCategory: mapping rule target_id ${r.target_id} not in targetIds`);
    }
  }

  db.exec('BEGIN');
  try {
    const src = db
      .prepare('SELECT deprecated_at FROM categories WHERE id = ?')
      .get(payload.sourceId) as unknown as { deprecated_at: string | null } | undefined;
    if (!src) {
      throw new Error(`splitCategory: source category ${payload.sourceId} not found`);
    }
    if (src.deprecated_at !== null) {
      throw new Error(`splitCategory: source category ${payload.sourceId} is deprecated`);
    }
    for (const tid of payload.targetIds) {
      const t = db
        .prepare('SELECT deprecated_at FROM categories WHERE id = ?')
        .get(tid) as unknown as { deprecated_at: string | null } | undefined;
      if (!t) {
        throw new Error(`splitCategory: target category ${tid} missing`);
      }
      if (t.deprecated_at !== null) {
        throw new Error(`splitCategory: target category ${tid} is deprecated`);
      }
    }

    const nextSeq = (
      db
        .prepare('SELECT COALESCE(MAX(event_seq), 0) + 1 AS seq FROM taxonomy_events')
        .get() as unknown as { seq: number }
    ).seq;

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      eventId,
      nextSeq,
      'split',
      JSON.stringify([payload.sourceId]),
      JSON.stringify(payload.targetIds),
      JSON.stringify(payload.mappingRule),
    );

    db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = ? WHERE id = ?",
    ).run(eventId, payload.sourceId);

    db.exec('COMMIT');
    return eventId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
