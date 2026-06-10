import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getBalanceSeries } from '../../../src/main/dashboard/balanceSeries';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Compte', 'checking')").run();
  return db;
}

let txSeq = 0;
function seedTx(db: DatabaseSync, date: string, amount: number): void {
  txSeq += 1;
  const id = `b${String(txSeq)}`;
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
     VALUES (?, 'a1', ?, ?, ?, 'x', 'X')`,
  ).run(id, id, date, amount);
}

describe('getBalanceSeries', () => {
  it('returns an empty series for an account with no transactions', () => {
    const db = freshDb();
    expect(getBalanceSeries(db, 'a1', 'max')).toEqual([]);
    db.close();
  });

  /** 14 consecutive active months: 2025-01 … 2026-02, +100 each. */
  function seedFourteenMonths(db: DatabaseSync): void {
    for (let i = 0; i < 14; i++) {
      const year = 2025 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, '0');
      seedTx(db, `${String(year)}-${month}-01`, 100);
    }
  }

  it('max: one monthly point per active month, balance cumulative over all history', () => {
    const db = freshDb();
    seedFourteenMonths(db);
    const points = getBalanceSeries(db, 'a1', 'max');
    expect(points).toHaveLength(14);
    expect(points[0]).toEqual({ period: '2025-01', balance: 100 });
    expect(points[13]).toEqual({ period: '2026-02', balance: 1400 });
    db.close();
  });

  it('1y / 6m: keeps the last 12 / 6 active months, balance stays cumulative', () => {
    const db = freshDb();
    seedFourteenMonths(db);
    const year = getBalanceSeries(db, 'a1', '1y');
    expect(year).toHaveLength(12);
    expect(year[0]).toEqual({ period: '2025-03', balance: 300 });

    const half = getBalanceSeries(db, 'a1', '6m');
    expect(half).toHaveLength(6);
    expect(half[0]).toEqual({ period: '2025-09', balance: 900 });
    expect(half[5]).toEqual({ period: '2026-02', balance: 1400 });
    db.close();
  });

  it('3m: daily points within 3 months of the latest transaction, cumulative from full history', () => {
    const db = freshDb();
    seedTx(db, '2026-01-05', 100); // outside the window, but counts in the running balance
    seedTx(db, '2026-03-15', 50);
    seedTx(db, '2026-04-01', -20);
    seedTx(db, '2026-06-10', 10);
    const points = getBalanceSeries(db, 'a1', '3m');
    expect(points).toEqual([
      { period: '2026-03-15', balance: 150 },
      { period: '2026-04-01', balance: 130 },
      { period: '2026-06-10', balance: 140 },
    ]);
    db.close();
  });

  it('3m: collapses multiple transactions on the same day into one point', () => {
    const db = freshDb();
    seedTx(db, '2026-06-01', 1000);
    seedTx(db, '2026-06-01', -300);
    seedTx(db, '2026-06-02', -50);
    const points = getBalanceSeries(db, 'a1', '3m');
    expect(points).toEqual([
      { period: '2026-06-01', balance: 700 },
      { period: '2026-06-02', balance: 650 },
    ]);
    db.close();
  });

  it('scopes to the requested account', () => {
    const db = freshDb();
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a2', 'Autre', 'checking')").run();
    seedTx(db, '2026-05-01', 100);
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
       VALUES ('other-b', 'a2', 'other-b', '2026-05-01', 999, 'x', 'X')`,
    ).run();
    expect(getBalanceSeries(db, 'a1', 'max')).toEqual([{ period: '2026-05', balance: 100 }]);
    db.close();
  });
});
