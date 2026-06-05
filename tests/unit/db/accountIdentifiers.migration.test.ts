import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 010 — account_identifiers', () => {
  it('creates the table and cascades on account delete', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    db.prepare(
      "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-x', 'X', 'checking', 'lcl', 'EUR')",
    ).run();
    db.prepare('INSERT INTO account_identifiers (identifier, account_id) VALUES (?, ?)').run(
      'ofx:30002:1',
      'acc-x',
    );

    const before = db.prepare('SELECT COUNT(*) AS n FROM account_identifiers').get() as unknown as {
      n: number;
    };
    expect(before.n).toBe(1);

    db.prepare('DELETE FROM accounts WHERE id = ?').run('acc-x');
    const after = db.prepare('SELECT COUNT(*) AS n FROM account_identifiers').get() as unknown as {
      n: number;
    };
    expect(after.n).toBe(0);
    db.close();
  });
});
