import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  findTransferPairs,
  detectTransfers,
  type PairRow,
} from '../../../src/main/transfers/detect';

function row(id: string, accountId: string, date: string, amount: number): PairRow {
  return { id, accountId, date, amount };
}

describe('findTransferPairs', () => {
  it('matches a −X / +X pair across accounts within the window', () => {
    const ids = findTransferPairs([
      row('out', 'perso', '2026-04-10', -500),
      row('in', 'livret', '2026-04-11', 500),
    ]);
    expect(ids).toEqual(new Set(['out', 'in']));
  });

  it('does not pair opposite amounts on the SAME account', () => {
    const ids = findTransferPairs([
      row('a', 'perso', '2026-04-10', -500),
      row('b', 'perso', '2026-04-10', 500),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair outside the ±3-day window', () => {
    const ids = findTransferPairs([
      row('out', 'perso', '2026-04-10', -500),
      row('in', 'livret', '2026-04-20', 500),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not pair a single leg with no mirror', () => {
    const ids = findTransferPairs([row('out', 'perso', '2026-04-10', -500)]);
    expect(ids.size).toBe(0);
  });

  it('pairs two identical same-day transfers one-to-one (no cross double-count)', () => {
    const ids = findTransferPairs([
      row('o1', 'perso', '2026-04-10', -500),
      row('o2', 'perso', '2026-04-10', -500),
      row('i1', 'livret', '2026-04-10', 500),
      row('i2', 'livret', '2026-04-10', 500),
    ]);
    expect(ids).toEqual(new Set(['o1', 'o2', 'i1', 'i2']));
  });

  it('matches an equal-and-opposite pair even if unrelated (accepted false-positive surface)', () => {
    const ids = findTransferPairs([
      row('rent', 'perso', '2026-04-01', -500),
      row('refund', 'livret', '2026-04-02', 500),
    ]);
    expect(ids).toEqual(new Set(['rent', 'refund']));
  });
});

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('livret', 'Livret', 'savings')").run();
  return db;
}

let seq = 0;
function seedTx(
  db: DatabaseSync,
  account: string,
  date: string,
  amount: number,
  opts: { transfer?: boolean; locked?: boolean } = {},
): string {
  seq += 1;
  const id = `tx${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_internal_transfer, user_modified)
     VALUES (?, ?, ?, ?, ?, 'x', 'X', ?, ?)`,
  ).run(id, account, id, date, amount, opts.transfer ? 1 : 0, opts.locked ? 1 : 0);
  return id;
}

function flag(db: DatabaseSync, id: string): number {
  return (
    db.prepare('SELECT is_internal_transfer AS f FROM transactions WHERE id = ?').get(id) as {
      f: number;
    }
  ).f;
}

describe('detectTransfers', () => {
  it('flags both legs of a detected pair', () => {
    const db = freshDb();
    const out = seedTx(db, 'perso', '2026-04-10', -500);
    const inn = seedTx(db, 'livret', '2026-04-11', 500);
    const salary = seedTx(db, 'perso', '2026-04-01', 2500); // real income, no mirror

    const { paired } = detectTransfers(db);
    expect(paired).toBe(2);
    expect(flag(db, out)).toBe(1);
    expect(flag(db, inn)).toBe(1);
    expect(flag(db, salary)).toBe(0);
    db.close();
  });

  it('never touches user-locked rows and is idempotent', () => {
    const db = freshDb();
    const out = seedTx(db, 'perso', '2026-04-10', -500);
    const inn = seedTx(db, 'livret', '2026-04-11', 500);
    // A row the user explicitly un-marked as a transfer (locked, flag 0).
    const lockedOut = seedTx(db, 'perso', '2026-05-10', -800, { locked: true });
    seedTx(db, 'livret', '2026-05-11', 800); // its mirror — but the locked leg won't pair

    detectTransfers(db);
    detectTransfers(db); // second run: same state
    expect(flag(db, out)).toBe(1);
    expect(flag(db, inn)).toBe(1);
    expect(flag(db, lockedOut)).toBe(0); // stays un-flagged, never re-marked
    db.close();
  });

  it('clears a stale auto-mark when the pair no longer holds', () => {
    const db = freshDb();
    const lonely = seedTx(db, 'perso', '2026-04-10', -500, { transfer: true }); // auto-marked earlier, mirror gone
    const { paired } = detectTransfers(db);
    expect(paired).toBe(0);
    expect(flag(db, lonely)).toBe(0); // reset, since no mirror now and not user-locked
    db.close();
  });
});
