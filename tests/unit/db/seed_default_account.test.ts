import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('default account seed (migration 003)', () => {
  it('inserts the default LCL account', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get('acc-lcl-default') as
      | { id: string; name: string; type: string; bank_id: string; currency: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.name).toBe('Compte LCL');
    expect(row?.type).toBe('checking');
    expect(row?.bank_id).toBe('lcl');
    expect(row?.currency).toBe('EUR');
    db.close();
  });

  it('records version 3 in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(3);
    db.close();
  });

  it('is idempotent — running migrations twice keeps one account row', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    runMigrations(db);
    const row = db
      .prepare('SELECT count(*) as n FROM accounts WHERE id = ?')
      .get('acc-lcl-default') as { n: number };
    expect(row.n).toBe(1);
    db.close();
  });
});
