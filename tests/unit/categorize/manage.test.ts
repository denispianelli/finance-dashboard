import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listCategories,
  listRules,
  createRule,
  deleteRule,
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
    db.prepare("UPDATE categories SET deprecated_at = '2026-01-01' WHERE id = 'cat-voyages'").run();
    expect(listCategories(db).find((c) => c.id === 'cat-voyages')).toBeUndefined();
    db.close();
  });
});

describe('listRules', () => {
  it('joins the category name and exposes hit counts in creation order', () => {
    const db = freshDb();
    const rules = listRules(db);
    expect(rules.length).toBeGreaterThan(0);
    const carrefour = rules.find((r) => r.matchValue === 'CARREFOUR');
    expect(carrefour).toMatchObject({
      categoryId: 'cat-alimentation',
      categoryName: 'Alimentation',
      hitCount: 0,
    });
    // UBER EATS precedes UBER (precedence preserved)
    const eats = rules.findIndex((r) => r.matchValue === 'UBER EATS');
    const uber = rules.findIndex((r) => r.matchValue === 'UBER');
    expect(eats).toBeLessThan(uber);
    db.close();
  });
});

describe('createRule', () => {
  it('inserts a valid rule and returns it', () => {
    const db = freshDb();
    const before = listRules(db).length;
    const rule = createRule(db, {
      matchType: 'contains',
      matchValue: 'leroy merlin',
      categoryId: 'cat-logement',
    });
    expect(rule).toMatchObject({
      matchValue: 'leroy merlin',
      categoryId: 'cat-logement',
      hitCount: 0,
    });
    expect(listRules(db)).toHaveLength(before + 1);
    db.close();
  });

  it('trims the match value', () => {
    const db = freshDb();
    const rule = createRule(db, {
      matchType: 'contains',
      matchValue: '  IKEA  ',
      categoryId: 'cat-logement',
    });
    expect(rule.matchValue).toBe('IKEA');
    db.close();
  });

  it('rejects an empty match value', () => {
    const db = freshDb();
    expect(() =>
      createRule(db, { matchType: 'contains', matchValue: '   ', categoryId: 'cat-logement' }),
    ).toThrow(/empty/);
    db.close();
  });

  it('rejects a malformed regex up front', () => {
    const db = freshDb();
    expect(() =>
      createRule(db, { matchType: 'regex', matchValue: '(', categoryId: 'cat-logement' }),
    ).toThrow(/regular expression/);
    db.close();
  });

  it('rejects an unknown category', () => {
    const db = freshDb();
    expect(() =>
      createRule(db, { matchType: 'contains', matchValue: 'X', categoryId: 'nope' }),
    ).toThrow(/not found/);
    db.close();
  });
});

describe('deleteRule', () => {
  it('removes a rule by id', () => {
    const db = freshDb();
    const rule = createRule(db, {
      matchType: 'contains',
      matchValue: 'CASTORAMA',
      categoryId: 'cat-logement',
    });
    deleteRule(db, rule.id);
    expect(listRules(db).find((r) => r.id === rule.id)).toBeUndefined();
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
    // appended after the 10 seeded ones
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
    expect(listRules(db).some((r) => r.categoryId === 'cat-alimentation')).toBe(false);
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
