import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listCategories,
  createCategory,
  deleteCategory,
  setTransactionCategory,
} from '../../../src/main/categorize/manage';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

describe('listCategories', () => {
  it('returns the 10 seeded categories ordered by position', () => {
    const db = freshDb();
    const cats = listCategories(db);
    expect(cats).toHaveLength(10);
    expect(cats[0]?.position).toBeLessThanOrEqual(cats[1]?.position ?? Infinity);
    expect(cats.find((c) => c.id === 'cat-alimentation')).toMatchObject({
      name: 'Alimentation',
      icon: 'shop',
      isDefault: true,
    });
    db.close();
  });

  it('excludes deprecated categories', () => {
    const db = freshDb();
    db.prepare(
      "UPDATE categories SET deprecated_at = '2026-01-01' WHERE id = 'cat-transport'",
    ).run();
    expect(listCategories(db).find((c) => c.id === 'cat-transport')).toBeUndefined();
    db.close();
  });
});

describe('createCategory', () => {
  it('appends a non-default category and returns it', () => {
    const db = freshDb();
    const cat = createCategory(db, { name: '  Animaux  ', color: '#7AB890', icon: 'wallet' });
    expect(cat).toMatchObject({
      name: 'Animaux',
      color: '#7AB890',
      icon: 'wallet',
      isDefault: false,
    });
    expect(cat.id.startsWith('cat-')).toBe(true);
    expect(listCategories(db)).toHaveLength(11);
    expect(cat.position).toBeGreaterThan(10);
    db.close();
  });

  it('rejects an empty name and a bad color', () => {
    const db = freshDb();
    expect(() => createCategory(db, { name: ' ', color: '#7AB890', icon: 'wallet' })).toThrow(
      /name/,
    );
    expect(() => createCategory(db, { name: 'X', color: 'red', icon: 'wallet' })).toThrow(/color/);
    db.close();
  });
});

describe('deleteCategory', () => {
  it('removes the category, uncategorizes its transactions, and drops its rules', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id)
       VALUES ('t1', 'acc-lcl-default', 't1', '2026-05-01', -10, 'x', 'X', 'cat-alimentation')`,
    ).run();

    const result = deleteCategory(db, 'cat-alimentation');

    expect(result.uncategorizedCount).toBe(1);
    expect(listCategories(db).find((c) => c.id === 'cat-alimentation')).toBeUndefined();
    const rules = db
      .prepare("SELECT COUNT(*) n FROM categorization_rules WHERE category_id = 'cat-alimentation'")
      .get() as { n: number };
    expect(rules.n).toBe(0);
    const tx = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1') as {
      category_id: string | null;
    };
    expect(tx.category_id).toBeNull();
    db.close();
  });

  it('throws on an unknown category', () => {
    const db = freshDb();
    expect(() => deleteCategory(db, 'nope')).toThrow(/not found/);
    db.close();
  });
});

describe('setTransactionCategory', () => {
  function seedTx(db: DatabaseSync): void {
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id)
       VALUES ('t1', 'acc-lcl-default', 't1', '2026-05-01', -10, 'x', 'X', NULL)`,
    ).run();
  }

  it('assigns the category and marks the row user_modified', () => {
    const db = freshDb();
    seedTx(db);
    setTransactionCategory(db, { transactionId: 't1', categoryId: 'cat-alimentation' });
    const row = db
      .prepare('SELECT category_id, user_modified FROM transactions WHERE id = ?')
      .get('t1') as { category_id: string; user_modified: number };
    expect(row).toMatchObject({ category_id: 'cat-alimentation', user_modified: 1 });
    db.close();
  });

  it('throws on unknown category or transaction', () => {
    const db = freshDb();
    seedTx(db);
    expect(() => {
      setTransactionCategory(db, { transactionId: 't1', categoryId: 'nope' });
    }).toThrow(/not found/);
    expect(() => {
      setTransactionCategory(db, { transactionId: 'ghost', categoryId: 'cat-alimentation' });
    }).toThrow(/not found/);
    db.close();
  });
});
