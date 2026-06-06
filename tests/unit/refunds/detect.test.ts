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
  it('pairs a card charge and its refund (same merchant, same account)', () => {
    const ids = findRefundPairs([
      row('charge', 'perso', '2025-03-01', -111.4, 'CB TICKETMASTER 28/02/25'),
      row('refund', 'perso', '2025-04-15', 111.4, 'CB TICKETMASTER 14/04/25'),
    ]);
    expect(ids).toEqual(new Set(['charge', 'refund']));
  });

  it('does not pair different merchants', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-03-01', -50, 'CB AMAZON'),
      row('b', 'perso', '2025-03-02', 50, 'CB FNAC'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair across different accounts (that would be a transfer)', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-03-01', -50, 'CB ZARA'),
      row('b', 'livret', '2025-03-02', 50, 'CB ZARA'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair beyond the window', () => {
    const ids = findRefundPairs([
      row('a', 'perso', '2025-01-01', -50, 'CB ZARA'),
      row('b', 'perso', '2025-12-31', 50, 'CB ZARA'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('pairs one-to-one when there are two charges and one refund', () => {
    const ids = findRefundPairs([
      row('c1', 'perso', '2025-03-01', -50, 'CB ZARA OPEN SKY'),
      row('c2', 'perso', '2025-03-10', -50, 'CB ZARA OPEN SKY'),
      row('r1', 'perso', '2025-03-12', 50, 'CB ZARA OPEN SKY'),
    ]);
    expect(ids.size).toBe(2); // exactly one pair
    expect(ids.has('r1')).toBe(true);
  });

  it('matches despite differing labels as long as a merchant token and a card leg are shared', () => {
    const ids = findRefundPairs([
      row('out', 'perso', '2025-01-10', -89.9, 'CB DEVRED 058 09/01/25'),
      row('in', 'perso', '2025-02-20', 89.9, 'CB DEVRED 19/02/25 AVOIR'),
    ]);
    expect(ids).toEqual(new Set(['out', 'in']));
  });

  it('does NOT pair person-to-person transfers that share a name but have no card leg', () => {
    const ids = findRefundPairs([
      row('in', 'perso', '2025-02-06', 180, 'VIR.PERMANENT AMENDOLA'),
      row('out', 'perso', '2025-02-07', -180, 'VIR SEPA MLLE LAURA AMENDOLA'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does NOT pair an unrelated gift and purchase (no shared merchant)', () => {
    const ids = findRefundPairs([
      row('gift', 'perso', '2025-02-01', 50, 'VIR INST MME PIANELLI CATH'),
      row('apple', 'perso', '2025-02-27', -50, 'CB APPLE STORE'),
    ]);
    expect(ids.size).toBe(0);
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
  opts: { locked?: boolean } = {},
): string {
  seq += 1;
  const id = `r${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, user_modified)
     VALUES (?, 'perso', ?, ?, ?, ?, ?, ?)`,
  ).run(id, id, date, amount, label, label, opts.locked ? 1 : 0);
  return id;
}

function refundFlag(db: DatabaseSync, id: string): number {
  return (
    db.prepare('SELECT is_refund AS f FROM transactions WHERE id = ?').get(id) as { f: number }
  ).f;
}

describe('detectRefunds', () => {
  it('flags both legs of a card refund and leaves real spending alone', () => {
    const db = freshDb();
    const charge = seedTx(db, '2025-03-01', -111.4, 'CB TICKETMASTER 28/02/25');
    const refund = seedTx(db, '2025-04-15', 111.4, 'CB TICKETMASTER 14/04/25');
    const groceries = seedTx(db, '2025-03-05', -60, 'CB SUPER U');

    const { paired } = detectRefunds(db);
    expect(paired).toBe(2);
    expect(refundFlag(db, charge)).toBe(1);
    expect(refundFlag(db, refund)).toBe(1);
    expect(refundFlag(db, groceries)).toBe(0);
    db.close();
  });

  it('respects user locks and is idempotent', () => {
    const db = freshDb();
    const charge = seedTx(db, '2025-03-01', -111.4, 'CB TICKETMASTER 28/02/25');
    const refund = seedTx(db, '2025-04-15', 111.4, 'CB TICKETMASTER 14/04/25');
    const lockedCharge = seedTx(db, '2025-05-01', -20, 'CB NETFLIX', { locked: true });
    seedTx(db, '2025-05-02', 20, 'CB NETFLIX'); // mirror, but the locked leg won't pair

    detectRefunds(db);
    detectRefunds(db);
    expect(refundFlag(db, charge)).toBe(1);
    expect(refundFlag(db, refund)).toBe(1);
    expect(refundFlag(db, lockedCharge)).toBe(0);
    db.close();
  });
});
