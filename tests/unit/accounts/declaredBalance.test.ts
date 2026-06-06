import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { setDeclaredBalance } from '../../../src/main/accounts/manage';

function db1(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('av', 'AV', 'life_insurance')").run();
  return db;
}

describe('setDeclaredBalance', () => {
  it('sets a declared balance and returns the updated summary', () => {
    const db = db1();
    const acc = setDeclaredBalance(db, { id: 'av', balance: 15000 });
    expect(acc).toMatchObject({ id: 'av', balance: 15000, balanceSource: 'declared' });
    db.close();
  });

  it('clears the declared balance when given null', () => {
    const db = db1();
    setDeclaredBalance(db, { id: 'av', balance: 15000 });
    const acc = setDeclaredBalance(db, { id: 'av', balance: null });
    expect(acc).toMatchObject({ id: 'av', balance: null, balanceSource: null });
    db.close();
  });

  it('throws for an unknown account', () => {
    const db = db1();
    expect(() => setDeclaredBalance(db, { id: 'nope', balance: 1 })).toThrow();
    db.close();
  });
});
