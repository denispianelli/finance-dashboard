import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { renameCategory } from '../../../src/main/taxonomy/renameCategory';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedCategory(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

describe('renameCategory', () => {
  it('updates categories.name and appends a rename event with old/new names', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');

    const eventId = renameCategory(db, { id: 'c1', newName: 'Restaurants & food delivery' });

    const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get('c1') as unknown as {
      name: string;
    };
    expect(cat.name).toBe('Restaurants & food delivery');

    const event = db
      .prepare(
        'SELECT kind, source_ids, target_ids, payload, event_seq FROM taxonomy_events WHERE id = ?',
      )
      .get(eventId) as unknown as {
      kind: string;
      source_ids: string;
      target_ids: string;
      payload: string;
      event_seq: number;
    };
    expect(event.kind).toBe('rename');
    expect(JSON.parse(event.source_ids)).toEqual(['c1']);
    expect(JSON.parse(event.target_ids)).toEqual(['c1']);
    expect(JSON.parse(event.payload)).toEqual({
      kind: 'rename',
      old_name: 'Restaurants',
      new_name: 'Restaurants & food delivery',
    });
    expect(event.event_seq).toBe(1);
    db.close();
  });

  it('throws when the category does not exist', () => {
    const db = freshDb();
    expect(() => renameCategory(db, { id: 'missing', newName: 'X' })).toThrow(/not found/);
    db.close();
  });

  it('throws when the category is already deprecated', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Old');
    db.prepare("UPDATE categories SET deprecated_at = datetime('now') WHERE id = 'c1'").run();
    expect(() => renameCategory(db, { id: 'c1', newName: 'X' })).toThrow(/deprecated/);
    db.close();
  });

  it('assigns sequential event_seq when other events already exist', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    seedCategory(db, 'c2', 'B');
    renameCategory(db, { id: 'c1', newName: 'A2' });
    const eventId = renameCategory(db, { id: 'c2', newName: 'B2' });
    const event = db
      .prepare('SELECT event_seq FROM taxonomy_events WHERE id = ?')
      .get(eventId) as unknown as { event_seq: number };
    expect(event.event_seq).toBe(2);
    db.close();
  });
});
