import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow } from '../../../src/main/dashboard/consolidated';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
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
