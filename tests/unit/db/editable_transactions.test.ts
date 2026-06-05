import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 009 (editable transactions)', () => {
  it('adds original_date, original_amount and edited_at to transactions', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain('original_date');
    expect(cols).toContain('original_amount');
    expect(cols).toContain('edited_at');
    db.close();
  });

  it('records version 9', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(9);
    db.close();
  });
});
