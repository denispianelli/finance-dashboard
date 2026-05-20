import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('004_add_fitid', () => {
  it('adds a nullable fitid column to transactions', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('transactions')").all() as unknown as {
      name: string;
      notnull: number;
    }[];
    const fitid = cols.find((c) => c.name === 'fitid');
    expect(fitid).toBeDefined();
    expect(fitid?.notnull).toBe(0);
    db.close();
  });

  it('records migration version 4 and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as unknown as {
        version: number;
      }[]
    ).map((r) => r.version);
    expect(versions).toContain(4);
    expect(new Set(versions).size).toBe(versions.length);
    db.close();
  });
});
