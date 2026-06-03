import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { createAccount, updateAccount, deleteAccount } from '../../../src/main/accounts/manage';
import { getAccountSummaries } from '../../../src/main/dashboard/queries';

function seedImportWithTx(db: DatabaseSync, accountId: string, count: number): void {
  const importId = `imp-${accountId}`;
  db.prepare(
    `INSERT INTO imports (id, account_id, file_hash, source_type, date_range_start, date_range_end)
     VALUES (?, ?, ?, 'ofx', '2026-01-01', '2026-01-31')`,
  ).run(importId, accountId, `hash-${accountId}`);
  for (let i = 0; i < count; i++) {
    db.prepare(
      `INSERT INTO transactions (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean)
       VALUES (?, ?, ?, ?, '2026-01-15', -10, 'X', 'x')`,
    ).run(`tx-${accountId}-${String(i)}`, accountId, importId, `h-${accountId}-${String(i)}`);
  }
}

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

describe('updateAccount', () => {
  it('renames an account and updates its bank label (trimmed)', () => {
    const db = freshDb();
    const acc = createAccount(db, { name: 'Old', bankId: 'LCL' });
    const updated = updateAccount(db, { id: acc.id, name: '  New  ', bankId: '  Boursorama  ' });
    expect(updated).toMatchObject({ id: acc.id, name: 'New', bankId: 'Boursorama' });
    db.close();
  });

  it('normalizes an empty bank to null and rejects an empty name', () => {
    const db = freshDb();
    const acc = createAccount(db, { name: 'A', bankId: 'X' });
    expect(updateAccount(db, { id: acc.id, name: 'A', bankId: '   ' }).bankId).toBeNull();
    expect(() => updateAccount(db, { id: acc.id, name: '   ', bankId: null })).toThrow(/name/);
    db.close();
  });

  it('throws when the account does not exist', () => {
    const db = freshDb();
    expect(() => updateAccount(db, { id: 'nope', name: 'X', bankId: null })).toThrow(/not found/);
    db.close();
  });
});

describe('deleteAccount', () => {
  it('cascades: removes the account, its transactions and imports, returns the count', () => {
    const db = freshDb();
    const acc = createAccount(db, { name: 'To delete', bankId: null });
    seedImportWithTx(db, acc.id, 3);

    const res = deleteAccount(db, acc.id);
    expect(res.deletedTransactions).toBe(3);
    expect(getAccountSummaries(db).some((a) => a.id === acc.id)).toBe(false);

    const txLeft = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?')
      .get(acc.id) as unknown as { n: number };
    expect(txLeft.n).toBe(0);
    const impLeft = db
      .prepare('SELECT COUNT(*) AS n FROM imports WHERE account_id = ?')
      .get(acc.id) as unknown as { n: number };
    expect(impLeft.n).toBe(0);
    db.close();
  });

  it('leaves other accounts and their transactions intact', () => {
    const db = freshDb();
    const a = createAccount(db, { name: 'A', bankId: null });
    const b = createAccount(db, { name: 'B', bankId: null });
    seedImportWithTx(db, a.id, 2);
    seedImportWithTx(db, b.id, 5);

    deleteAccount(db, a.id);
    const summaries = getAccountSummaries(db);
    expect(summaries.some((x) => x.id === a.id)).toBe(false);
    expect(summaries.find((x) => x.id === b.id)?.txCount).toBe(5);
    db.close();
  });

  it('throws when the account does not exist', () => {
    const db = freshDb();
    expect(() => deleteAccount(db, 'nope')).toThrow(/not found/);
    db.close();
  });
});
