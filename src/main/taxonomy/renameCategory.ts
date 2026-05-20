import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RenamePayload } from '@shared/types/taxonomy';

export function renameCategory(db: DatabaseSync, payload: { id: string; newName: string }): string {
  db.exec('BEGIN');
  try {
    const row = db
      .prepare('SELECT name, deprecated_at FROM categories WHERE id = ?')
      .get(payload.id) as unknown as { name: string; deprecated_at: string | null } | undefined;
    if (!row) {
      throw new Error(`renameCategory: category ${payload.id} not found`);
    }
    if (row.deprecated_at !== null) {
      throw new Error(
        `renameCategory: category ${payload.id} is deprecated (at ${row.deprecated_at})`,
      );
    }

    const nextSeq = (
      db
        .prepare('SELECT COALESCE(MAX(event_seq), 0) + 1 AS seq FROM taxonomy_events')
        .get() as unknown as { seq: number }
    ).seq;

    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(payload.newName, payload.id);

    const eventId = randomUUID();
    const eventPayload: RenamePayload = {
      kind: 'rename',
      old_name: row.name,
      new_name: payload.newName,
    };
    db.prepare(
      'INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      eventId,
      nextSeq,
      'rename',
      JSON.stringify([payload.id]),
      JSON.stringify([payload.id]),
      JSON.stringify(eventPayload),
    );

    db.exec('COMMIT');
    return eventId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
