import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../../src/main/transactions/mutate';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Compte', 'checking')").run();
  return db;
}

function seed(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, user_modified)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour', 0)`,
  ).run();
}

interface Row {
  date: string;
  amount: number;
  label_clean: string;
  original_date: string | null;
  original_amount: number | null;
  edited_at: string | null;
  user_modified: number;
}
const read = (db: DatabaseSync): Row =>
  db
    .prepare(
      'SELECT date, amount, label_clean, original_date, original_amount, edited_at, user_modified FROM transactions WHERE id = ?',
    )
    .get('t1') as unknown as Row;

describe('updateTransaction', () => {
  it('changes the amount and snapshots the extracted original once', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', amount: -90 });
    let r = read(db);
    expect(r.amount).toBe(-90);
    expect(r.original_amount).toBe(-84.3);
    expect(r.edited_at).not.toBeNull();
    expect(r.user_modified).toBe(1);

    // A second amount edit keeps the FIRST (extracted) snapshot.
    updateTransaction(db, { transactionId: 't1', amount: -100 });
    r = read(db);
    expect(r.amount).toBe(-100);
    expect(r.original_amount).toBe(-84.3);
    db.close();
  });

  it('changes the date and snapshots original_date but not original_amount', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', date: '2026-05-20' });
    const r = read(db);
    expect(r.date).toBe('2026-05-20');
    expect(r.original_date).toBe('2026-05-14');
    expect(r.original_amount).toBeNull(); // amount unchanged → not a figures change
    db.close();
  });

  it('edits the label without setting any figure snapshot', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', label: 'Carrefour Market' });
    const r = read(db);
    expect(r.label_clean).toBe('Carrefour Market');
    expect(r.original_date).toBeNull();
    expect(r.original_amount).toBeNull();
    expect(r.edited_at).not.toBeNull(); // still a manual edit
    db.close();
  });

  it('throws on an unknown id', () => {
    const db = freshDb();
    expect(() => {
      updateTransaction(db, { transactionId: 'nope', amount: 1 });
    }).toThrow();
    db.close();
  });

  it('rejects a malformed date and a non-finite amount', () => {
    const db = freshDb();
    seed(db);
    expect(() => {
      updateTransaction(db, { transactionId: 't1', date: '14/05/2026' });
    }).toThrow();
    expect(() => {
      updateTransaction(db, { transactionId: 't1', amount: Number.NaN });
    }).toThrow();
    db.close();
  });

  it('rejects an empty label', () => {
    const db = freshDb();
    seed(db);
    expect(() => {
      updateTransaction(db, { transactionId: 't1', label: '   ' });
    }).toThrow();
    db.close();
  });
});

describe('deleteTransaction / restoreTransaction', () => {
  it('returns a faithful snapshot, deletes the row, and restores it', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO transactions (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified, fitid)
       VALUES ('t1', 'a1', NULL, 'hash1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour', NULL, 0, 0, 'fit1')`,
    ).run();

    const snapshot = deleteTransaction(db, 't1');
    expect(snapshot.id).toBe('t1');
    expect(snapshot.txHash).toBe('hash1');
    expect(snapshot.fitid).toBe('fit1');
    expect(snapshot.amount).toBe(-84.3);
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });

    restoreTransaction(db, snapshot);
    const back = db
      .prepare('SELECT id, tx_hash, fitid, amount FROM transactions WHERE id = ?')
      .get('t1');
    expect(back).toMatchObject({ id: 't1', tx_hash: 'hash1', fitid: 'fit1', amount: -84.3 });
    db.close();
  });

  it('throws when deleting an unknown id', () => {
    const db = freshDb();
    expect(() => deleteTransaction(db, 'nope')).toThrow();
    db.close();
  });
});
