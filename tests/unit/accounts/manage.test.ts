import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { createAccount } from '../../../src/main/accounts/manage';
import { getAccountSummaries } from '../../../src/main/dashboard/queries';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

describe('createAccount', () => {
  it('creates an account with zero balance and a bank label', () => {
    const db = freshDb();
    const acc = createAccount(db, { name: '  Compte joint  ', bankId: 'Boursorama' });
    expect(acc).toMatchObject({
      name: 'Compte joint',
      bankId: 'Boursorama',
      currency: 'EUR',
      balance: 0,
      txCount: 0,
    });
    expect(acc.id.startsWith('acc-')).toBe(true);
    expect(getAccountSummaries(db).some((a) => a.id === acc.id)).toBe(true);
    db.close();
  });

  it('allows a null bank and rejects an empty name', () => {
    const db = freshDb();
    expect(createAccount(db, { name: 'Livret A', bankId: null }).bankId).toBeNull();
    expect(createAccount(db, { name: 'X', bankId: '   ' }).bankId).toBeNull();
    expect(() => createAccount(db, { name: '   ', bankId: null })).toThrow(/name/);
    db.close();
  });

  it('does not collide with the seeded default account', () => {
    const db = freshDb();
    createAccount(db, { name: 'Second', bankId: null });
    expect(getAccountSummaries(db).map((a) => a.id)).toContain('acc-lcl-default');
    expect(getAccountSummaries(db)).toHaveLength(2);
    db.close();
  });
});
