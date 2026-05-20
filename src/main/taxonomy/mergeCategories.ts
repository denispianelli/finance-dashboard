import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function mergeCategories(
  db: DatabaseSync,
  payload: { sourceIds: string[]; targetId: string },
): string {
  if (payload.sourceIds.length < 2) {
    throw new Error('mergeCategories: at least 2 sources required');
  }

  db.exec('BEGIN');
  try {
    for (const sId of payload.sourceIds) {
      const s = db
        .prepare('SELECT deprecated_at FROM categories WHERE id = ?')
        .get(sId) as unknown as { deprecated_at: string | null } | undefined;
      if (!s) {
        throw new Error(`mergeCategories: source category ${sId} missing`);
      }
      if (s.deprecated_at !== null) {
        throw new Error(`mergeCategories: source category ${sId} is deprecated`);
      }
    }
    const tgt = db
      .prepare('SELECT deprecated_at FROM categories WHERE id = ?')
      .get(payload.targetId) as unknown as { deprecated_at: string | null } | undefined;
    if (!tgt) {
      throw new Error(`mergeCategories: target category ${payload.targetId} not found`);
    }
    if (tgt.deprecated_at !== null) {
      throw new Error(`mergeCategories: target category ${payload.targetId} is deprecated`);
    }

    const nextSeq = (
      db
        .prepare('SELECT COALESCE(MAX(event_seq), 0) + 1 AS seq FROM taxonomy_events')
        .get() as unknown as { seq: number }
    ).seq;

    const eventId = randomUUID();
    db.prepare(
      'INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES (?, ?, ?, ?, ?, NULL)',
    ).run(
      eventId,
      nextSeq,
      'merge',
      JSON.stringify(payload.sourceIds),
      JSON.stringify([payload.targetId]),
    );

    const updateSrc = db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = ? WHERE id = ?",
    );
    for (const sId of payload.sourceIds) {
      updateSrc.run(eventId, sId);
    }

    db.exec('COMMIT');
    return eventId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
