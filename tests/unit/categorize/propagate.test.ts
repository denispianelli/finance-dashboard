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
function seed(
  db: DatabaseSync,
  label: string,
  opts: { categoryId?: string; locked?: boolean } = {},
) {
  seq += 1;
  const id = `t${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'perso', ?, '2025-03-01', 100, ?, ?, ?, ?)`,
  ).run(id, id, label, label, opts.categoryId ?? null, opts.locked ? 1 : 0);
  return id;
}

function categoryOf(db: DatabaseSync, id: string): string | null {
  return (
    db.prepare('SELECT category_id AS c FROM transactions WHERE id = ?').get(id) as {
      c: string | null;
    }
  ).c;
}

describe('setTransactionCategory — propagation', () => {
  it('assigning Transfert flows to every similar label and saves a rule', () => {
    const db = freshDb();
    const a = seed(db, 'VIREMENT M DENIS PIANELLI 12/03/25');
    const b = seed(db, 'VIREMENT M DENIS PIANELLI 14/05/25');
    const other = seed(db, 'CB CARREFOUR 01/03/25');

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-transferts' });

    expect(categoryOf(db, a)).toBe('cat-transferts');
    expect(categoryOf(db, b)).toBe('cat-transferts'); // propagated despite different date
    expect(categoryOf(db, other)).toBeNull();

    const rule = db
      .prepare(
        "SELECT match_value AS v FROM categorization_rules WHERE category_id = 'cat-transferts' AND match_type = 'contains' AND match_value LIKE 'VIREMENT M DENIS%'",
      )
      .get() as { v: string } | undefined;
    expect(rule?.v).toBe('VIREMENT M DENIS PIANELLI');
    db.close();
  });

  it('does not override a transaction manually filed under another category', () => {
    const db = freshDb();
    const a = seed(db, 'VIREMENT MLLE LAURA AMENDOLA 01/01/25');
    const manual = seed(db, 'VIREMENT MLLE LAURA AMENDOLA 02/02/25', {
      categoryId: 'cat-revenus',
      locked: true,
    });

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-remboursement' });

    expect(categoryOf(db, a)).toBe('cat-remboursement');
    expect(categoryOf(db, manual)).toBe('cat-revenus'); // protected
    db.close();
  });

  it('reclassifies the clicked row even when it was manually filed elsewhere', () => {
    const db = freshDb();
    const a = seed(db, 'VIREMENT M DENIS PIANELLI 03/03/25', {
      categoryId: 'cat-abonnements',
      locked: true,
    });

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-transferts' });

    expect(categoryOf(db, a)).toBe('cat-transferts'); // the explicit click always wins
    db.close();
  });

  it('a normal category assignment touches only the one transaction', () => {
    const db = freshDb();
    const a = seed(db, 'CB MONOPRIX 10/03/25');
    const b = seed(db, 'CB MONOPRIX 11/03/25');

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-alimentation' });

    expect(categoryOf(db, a)).toBe('cat-alimentation');
    expect(categoryOf(db, b)).toBeNull(); // no propagation for normal categories
    db.close();
  });
});
