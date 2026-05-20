import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { mergeCategories } from '../../../src/main/taxonomy/mergeCategories';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedCategory(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

describe('mergeCategories', () => {
  it('deprecates all sources, links them to the merge event, target untouched, payload is NULL', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'Old A');
    seedCategory(db, 's2', 'Old B');
    seedCategory(db, 'tgt', 'New');

    const eventId = mergeCategories(db, { sourceIds: ['s1', 's2'], targetId: 'tgt' });

    for (const sId of ['s1', 's2']) {
      const cat = db
        .prepare('SELECT deprecated_at, replaced_by_event_id FROM categories WHERE id = ?')
        .get(sId) as unknown as {
        deprecated_at: string | null;
        replaced_by_event_id: string | null;
      };
      expect(cat.deprecated_at).not.toBeNull();
      expect(cat.replaced_by_event_id).toBe(eventId);
    }
    const tgt = db
      .prepare('SELECT deprecated_at FROM categories WHERE id = ?')
      .get('tgt') as unknown as { deprecated_at: string | null };
    expect(tgt.deprecated_at).toBeNull();

    const event = db
      .prepare(
        'SELECT kind, source_ids, target_ids, payload, event_seq FROM taxonomy_events WHERE id = ?',
      )
      .get(eventId) as unknown as {
      kind: string;
      source_ids: string;
      target_ids: string;
      payload: string | null;
      event_seq: number;
    };
    expect(event.kind).toBe('merge');
    expect(JSON.parse(event.source_ids)).toEqual(['s1', 's2']);
    expect(JSON.parse(event.target_ids)).toEqual(['tgt']);
    expect(event.payload).toBeNull();
    expect(event.event_seq).toBe(1);
    db.close();
  });

  it('throws when a source is missing', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'A');
    seedCategory(db, 'tgt', 'T');
    expect(() => mergeCategories(db, { sourceIds: ['s1', 'missing'], targetId: 'tgt' })).toThrow(
      /source.*missing/,
    );
    db.close();
  });

  it('throws when a source is already deprecated', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'A');
    seedCategory(db, 's2', 'B');
    seedCategory(db, 'tgt', 'T');
    db.prepare("UPDATE categories SET deprecated_at = datetime('now') WHERE id = 's2'").run();
    expect(() => mergeCategories(db, { sourceIds: ['s1', 's2'], targetId: 'tgt' })).toThrow(
      /deprecated/,
    );
    db.close();
  });

  it('throws when target is missing', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'A');
    seedCategory(db, 's2', 'B');
    expect(() => mergeCategories(db, { sourceIds: ['s1', 's2'], targetId: 'missing' })).toThrow(
      /target.*not found/,
    );
    db.close();
  });

  it('throws when target is deprecated', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'A');
    seedCategory(db, 's2', 'B');
    seedCategory(db, 'tgt', 'T');
    db.prepare("UPDATE categories SET deprecated_at = datetime('now') WHERE id = 'tgt'").run();
    expect(() => mergeCategories(db, { sourceIds: ['s1', 's2'], targetId: 'tgt' })).toThrow(
      /target.*deprecated/,
    );
    db.close();
  });

  it('throws when sourceIds.length < 2', () => {
    const db = freshDb();
    seedCategory(db, 's1', 'A');
    seedCategory(db, 'tgt', 'T');
    expect(() => mergeCategories(db, { sourceIds: ['s1'], targetId: 'tgt' })).toThrow(
      /at least 2 sources/,
    );
    db.close();
  });
});
