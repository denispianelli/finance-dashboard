import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('migration 019 (LLM removal)', () => {
  it('leaves no llm_attempts table', () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'llm_attempts'")
      .get();
    expect(row).toBeUndefined();
    db.close();
  });

  it('removes the categorize opt-out setting row', () => {
    const db = freshDb();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'categorize.optOut'").get();
    expect(row).toBeUndefined();
    db.close();
  });
});
