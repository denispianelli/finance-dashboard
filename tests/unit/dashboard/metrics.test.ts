import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getDashboardMetrics } from '../../../src/main/dashboard/metrics';

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
  const id = `t${String(txSeq)}`;
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
     VALUES (?, 'a1', ?, ?, ?, 'x', 'X')`,
  ).run(id, id, date, amount);
}

describe('getDashboardMetrics', () => {
  it('returns zero balance and empty series for an account with no transactions', () => {
    const db = freshDb();
    expect(getDashboardMetrics(db, 'a1')).toEqual({ balance: 0, series: [] });
    db.close();
  });

  it('aggregates income/expense/net per month with a running balance', () => {
    const db = freshDb();
    seedTx(db, '2026-04-10', 2000); // income
    seedTx(db, '2026-04-15', -500); // expense
    seedTx(db, '2026-05-03', 2000);
    seedTx(db, '2026-05-20', -800);

    const { balance, series } = getDashboardMetrics(db, 'a1');
    expect(balance).toBe(2700);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({
      month: '2026-04',
      income: 2000,
      expense: -500,
      net: 1500,
      balance: 1500,
    });
    expect(series[1]).toMatchObject({
      month: '2026-05',
      income: 2000,
      expense: -800,
      net: 1200,
      balance: 2700, // cumulative
    });
    db.close();
  });

  it('keeps only the last 12 active months but balance stays cumulative over all history', () => {
    const db = freshDb();
    // 14 months, +100 each → final balance 1400, but series capped at 12
    for (let i = 0; i < 14; i++) {
      const month = String(i + 1).padStart(2, '0');
      seedTx(db, `2025-${month}-01`, 100);
    }
    const { balance, series } = getDashboardMetrics(db, 'a1');
    expect(balance).toBe(1400);
    expect(series).toHaveLength(12);
    // First kept month is the 3rd one (months 1–2 dropped); its running balance
    // already includes the dropped months.
    expect(series[0]?.balance).toBe(300);
    expect(series[11]?.balance).toBe(1400);
    db.close();
  });

  it('scopes to the requested account', () => {
    const db = freshDb();
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a2', 'Autre', 'checking')").run();
    seedTx(db, '2026-05-01', 100);
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
       VALUES ('other', 'a2', 'other', '2026-05-01', 999, 'x', 'X')`,
    ).run();
    expect(getDashboardMetrics(db, 'a1').balance).toBe(100);
    db.close();
  });
});
