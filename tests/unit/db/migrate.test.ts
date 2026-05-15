import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('runMigrations', () => {
  it('creates all tables on a fresh database', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(tables).toContain('accounts');
    expect(tables).toContain('transactions');
    expect(tables).toContain('categories');
    expect(tables).toContain('imports');
    expect(tables).toContain('bank_column_mappings');
    expect(tables).toContain('categorization_rules');
    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('records applied versions in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as Array<{
        version: number;
      }>
    ).map((r) => r.version);
    expect(versions).toContain(1);
    db.close();
  });
});
