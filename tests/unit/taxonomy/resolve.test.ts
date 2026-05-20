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
