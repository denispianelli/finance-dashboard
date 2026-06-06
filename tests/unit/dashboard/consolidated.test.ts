import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow, getNetWorth } from '../../../src/main/dashboard/consolidated';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  // Migrations seed a default LCL account; drop it so these tests start from a
  // known two-account world (perso + livret).
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  db.prepare(
    "INSERT INTO accounts (id, name, type) VALUES ('livret', 'Livret A', 'savings')",
  ).run();
  return db;
}

let txSeq = 0;
function seedTx(
  db: DatabaseSync,
  account: string,
  date: string,
  amount: number,
  opts: { transfer?: boolean; categoryId?: string } = {},
): void {
  txSeq += 1;
  const id = `t${String(txSeq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_internal_transfer, category_id)
     VALUES (?, ?, ?, ?, ?, 'x', 'X', ?, ?)`,
  ).run(id, account, id, date, amount, opts.transfer ? 1 : 0, opts.categoryId ?? null);
}

describe('getConsolidatedCashflow', () => {
  it('returns an empty series when there are no transactions', () => {
    const db = freshDb();
    expect(getConsolidatedCashflow(db, 'month')).toEqual([]);
    db.close();
  });

  it('sums income/expense/net across all accounts per month', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2026-04-10', 2000); // income
    seedTx(db, 'perso', '2026-04-15', -500); // expense
    seedTx(db, 'livret', '2026-04-20', 30); // interest, income on another account

    const series = getConsolidatedCashflow(db, 'month');
    expect(series).toEqual([{ period: '2026-04', income: 2030, expense: -500, net: 1530 }]);
    db.close();
  });

  it('excludes internal transfers (flagged or cat-transferts) from income and expense', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2026-04-10', 2000); // real income
    seedTx(db, 'perso', '2026-04-12', -500, { transfer: true }); // transfer out (flagged)
    seedTx(db, 'livret', '2026-04-12', 500, { transfer: true }); // transfer in (flagged)
    seedTx(db, 'perso', '2026-04-13', -100, { categoryId: 'cat-transferts' }); // transfer via category

    const series = getConsolidatedCashflow(db, 'month');
    // Only the 2000 income survives; none of the 500/500/100 transfer legs count.
    expect(series).toEqual([{ period: '2026-04', income: 2000, expense: 0, net: 2000 }]);
    db.close();
  });

  it('groups by calendar year when granularity is "year"', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2025-03-01', 1000);
    seedTx(db, 'perso', '2025-09-01', -400);
    seedTx(db, 'perso', '2026-02-01', 2000);
    seedTx(db, 'perso', '2026-08-01', -1500);

    const series = getConsolidatedCashflow(db, 'year');
    expect(series).toEqual([
      { period: '2025', income: 1000, expense: -400, net: 600 },
      { period: '2026', income: 2000, expense: -1500, net: 500 },
    ]);
    db.close();
  });
});

function seedValidatedImport(
  db: DatabaseSync,
  account: string,
  closingBalance: number,
  closingDate: string,
): void {
  txSeq += 1;
  const id = `imp${String(txSeq)}`;
  db.prepare(
    `INSERT INTO imports
       (id, account_id, file_hash, source_type, date_range_start, date_range_end,
        status, closing_balance, closing_balance_date)
     VALUES (?, ?, ?, 'ofx', ?, ?, 'validated', ?, ?)`,
  ).run(id, account, id, closingDate, closingDate, closingBalance, closingDate);
}

describe('getNetWorth', () => {
  it('totals 0 and lists every account as null when none is anchored', () => {
    const db = freshDb(); // seeds perso + livret, no imports → both unanchored
    const result = getNetWorth(db);
    expect(result.total).toBe(0);
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        { accountId: 'perso', name: 'Perso', balance: null },
        { accountId: 'livret', name: 'Livret A', balance: null },
      ]),
    );
    expect(result.accounts).toHaveLength(2);
    db.close();
  });

  it('sums anchored balances and lists each account', () => {
    const db = freshDb();
    seedValidatedImport(db, 'perso', 1200, '2026-04-30');
    seedValidatedImport(db, 'livret', 8000, '2026-04-30');

    const result = getNetWorth(db);
    expect(result.total).toBe(9200);
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        { accountId: 'perso', name: 'Perso', balance: 1200 },
        { accountId: 'livret', name: 'Livret A', balance: 8000 },
      ]),
    );
    db.close();
  });

  it('treats an unanchored account as null balance contributing 0 to the total', () => {
    const db = freshDb();
    seedValidatedImport(db, 'perso', 1200, '2026-04-30');
    // 'livret' has no validated import with a closing balance → null balance.

    const result = getNetWorth(db);
    expect(result.total).toBe(1200);
    expect(result.accounts).toContainEqual({
      accountId: 'livret',
      name: 'Livret A',
      balance: null,
    });
    db.close();
  });

  it('counts a declared balance toward net worth', () => {
    const db = freshDb(); // perso + livret, unanchored
    db.prepare("UPDATE accounts SET declared_balance = 5000 WHERE id = 'livret'").run();

    const result = getNetWorth(db);
    expect(result.total).toBe(5000);
    expect(result.accounts).toContainEqual({
      accountId: 'livret',
      name: 'Livret A',
      balance: 5000,
    });
    db.close();
  });
});

describe('getNetWorth — empty', () => {
  it('returns total 0 and no accounts when the DB has no accounts at all', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts'); // drop the seeded default account
    expect(getNetWorth(db)).toEqual({ total: 0, accounts: [] });
    db.close();
  });
});
