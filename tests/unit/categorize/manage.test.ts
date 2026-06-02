import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listCategories,
  listRules,
  createRule,
  deleteRule,
} from '../../../src/main/categorize/manage';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

describe('listCategories', () => {
  it('returns the 16 seeded categories ordered by position', () => {
    const db = freshDb();
    const cats = listCategories(db);
    expect(cats).toHaveLength(16);
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
