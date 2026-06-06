import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { findRefundPairs, detectRefunds, type RefundRow } from '../../../src/main/refunds/detect';

function row(
  id: string,
  accountId: string,
  date: string,
  amount: number,
  label: string,
): RefundRow {
  return { id, accountId, date, amount, label };
}

describe('findRefundPairs', () => {
  it('pairs a charge and its refund (same merchant, same account)', () => {
    const ids = findRefundPairs([
      row('charge', 'perso', '2025-03-01', -111.4, 'TICKETMASTER'),
      row('refund', 'perso', '2025-04-15', 111.4, 'TICKETMASTER'),
    ]);
    expect(ids).toEqual(new Set(['charge', 'refund']));
  });

  it('does not pair different merchants', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-03-01', -50, 'AMAZON'),
      row('b', 'perso', '2025-03-02', 50, 'FNAC'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair across different accounts (that would be a transfer)', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-03-01', -50, 'X'),
      row('b', 'livret', '2025-03-02', 50, 'X'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair beyond the window', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-01-01', -50, 'X'),
      row('b', 'perso', '2025-12-31', 50, 'X'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('pairs one-to-one when there are two charges and one refund', () => {
    const ids = findRefundPairs([
      row('c1', 'perso', '2025-03-01', -50, 'X'),
      row('c2', 'perso', '2025-03-10', -50, 'X'),
      row('r1', 'perso', '2025-03-12', 50, 'X'),
    ]);
    expect(ids.size).toBe(2); // exactly one pair
    expect(ids.has('r1')).toBe(true);
  });
});

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  return db;
}

let seq = 0;
function seedTx(
  db: DatabaseSync,
  date: string,
  amount: number,
  label: string,
  opts: { refund?: boolean; locked?: boolean } = {},
): string {
  seq += 1;
  const id = `r${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_refund, user_modified)
     VALUES (?, 'perso', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, id, date, amount, label, label, opts.refund ? 1 : 0, opts.locked ? 1 : 0);
  return id;
}

function refundFlag(db: DatabaseSync, id: string): number {
  return (
    db.prepare('SELECT is_refund AS f FROM transactions WHERE id = ?').get(id) as { f: number }
  ).f;
}

describe('detectRefunds', () => {
  it('flags both legs of a refund and leaves real spending alone', () => {
    const db = freshDb();
    const charge = seedTx(db, '2025-03-01', -111.4, 'TICKETMASTER');
    const refund = seedTx(db, '2025-04-15', 111.4, 'TICKETMASTER');
    const groceries = seedTx(db, '2025-03-05', -60, 'SUPER U');

    const { paired } = detectRefunds(db);
    expect(paired).toBe(2);
    expect(refundFlag(db, charge)).toBe(1);
    expect(refundFlag(db, refund)).toBe(1);
    expect(refundFlag(db, groceries)).toBe(0);
    db.close();
  });

  it('respects user locks and is idempotent', () => {
    const db = freshDb();
    const charge = seedTx(db, '2025-03-01', -111.4, 'TICKETMASTER');
    const refund = seedTx(db, '2025-04-15', 111.4, 'TICKETMASTER');
    const lockedCharge = seedTx(db, '2025-05-01', -20, 'NETFLIX', { locked: true });
    seedTx(db, '2025-05-02', 20, 'NETFLIX'); // mirror, but the locked leg won't pair

    detectRefunds(db);
    detectRefunds(db);
    expect(refundFlag(db, charge)).toBe(1);
    expect(refundFlag(db, refund)).toBe(1);
    expect(refundFlag(db, lockedCharge)).toBe(0);
    db.close();
  });
});
