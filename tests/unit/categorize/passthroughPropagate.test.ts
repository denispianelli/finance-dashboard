import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { setTransactionCategory } from '../../../src/main/categorize/manage';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  return db;
}

let seq = 0;
function seed(db: DatabaseSync, label: string, amount: number): string {
  seq += 1;
  const id = `t${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'perso', ?, '2025-03-01', ?, ?, ?, NULL, 0)`,
  ).run(id, id, amount, label, label);
  return id;
}
function catOf(db: DatabaseSync, id: string): string | null {
  return (
    db.prepare('SELECT category_id AS c FROM transactions WHERE id = ?').get(id) as {
      c: string | null;
    }
  ).c;
}

describe('setTransactionCategory — passthrough amount-scoped fan-out', () => {
  it('fans the category to same (label + amount) rows only', () => {
    const db = freshDb();
    const a = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2); // clicked
    const b = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2); // same label+amount
    const c = seed(db, 'PRLV SEPA PAYPAL EUROPE', -43); // same label, other amount
    const d = seed(db, 'CARREFOUR MARKET', -17.2); // other label, same amount

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-alimentation' });

    expect(catOf(db, a)).toBe('cat-alimentation');
    expect(catOf(db, b)).toBe('cat-alimentation'); // fanned out
    expect(catOf(db, c)).toBeNull(); // different amount untouched
    expect(catOf(db, d)).toBeNull(); // different label untouched
    db.close();
  });

  it('does not overwrite a row already categorized by hand', () => {
    const db = freshDb();
    const a = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2);
    const b = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2);
    setTransactionCategory(db, { transactionId: b, categoryId: 'cat-loisirs' }); // b set first
    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-alimentation' }); // a + fan-out

    expect(catOf(db, a)).toBe('cat-alimentation');
    expect(catOf(db, b)).toBe('cat-loisirs'); // kept (already categorized)
    db.close();
  });
});
