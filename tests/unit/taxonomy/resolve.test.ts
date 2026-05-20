import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { resolveCategoryAsOf } from '../../../src/main/taxonomy/resolve';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedCategory(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

describe('resolveCategoryAsOf — identity passthrough', () => {
  it('as_of_now returns {id, name} from categories.name when no events exist', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_now');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('as_of_period returns {id, name} from categories.name when no events exist', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-01-01');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('throws when category does not exist', () => {
    const db = freshDb();
    expect(() => resolveCategoryAsOf(db, 'missing', 'as_of_now')).toThrow(/not found/);
    db.close();
  });
});

describe('resolveCategoryAsOf — as_of_period rename walk', () => {
  it('throws when date arg is missing', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    expect(() => resolveCategoryAsOf(db, 'c1', 'as_of_period')).toThrow(/date is required/);
    db.close();
  });

  it('returns current name when no rename event exists', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-05-15');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('returns the historical name after one rename at the renamed time', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    // rename event at 2026-03-01: payload {old_name: Restaurants, new_name: Food}
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-03-01')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'Restaurants', new_name: 'Food' }));
    db.prepare("UPDATE categories SET name = 'Food' WHERE id = 'c1'").run();

    // at 2026-03-15 (after rename) → Food
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-03-15')).toEqual({
      id: 'c1',
      name: 'Food',
    });
    // at 2026-02-01 (before rename) → original Restaurants
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-02-01')).toEqual({
      id: 'c1',
      name: 'Restaurants',
    });
    db.close();
  });

  it('returns the latest rename effective at date with multiple renames', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-01-15')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'A', new_name: 'B' }));
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e2', 2, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-03-15')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'B', new_name: 'C' }));
    db.prepare("UPDATE categories SET name = 'C' WHERE id = 'c1'").run();

    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-01-01')).toEqual({
      id: 'c1',
      name: 'A',
    });
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-02-15')).toEqual({
      id: 'c1',
      name: 'B',
    });
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-04-15')).toEqual({
      id: 'c1',
      name: 'C',
    });
    db.close();
  });
});
