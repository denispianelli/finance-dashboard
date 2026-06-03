import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAccountByIdentifier, learnAccountRoute } from '../../../src/main/import/accountRoutes';

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a', 'A', 'checking', 'lcl', 'EUR')",
  ).run();
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-b', 'B', 'checking', 'lcl', 'EUR')",
  ).run();
});

describe('accountRoutes', () => {
  it('returns null for an unknown identifier', () => {
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBeNull();
  });

  it('learns then finds a route', () => {
    learnAccountRoute(db, 'ofx:30002:1', 'acc-a');
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBe('acc-a');
  });

  it('upserts (re-points) an existing identifier', () => {
    learnAccountRoute(db, 'ofx:30002:1', 'acc-a');
    learnAccountRoute(db, 'ofx:30002:1', 'acc-b');
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBe('acc-b');
  });
});
