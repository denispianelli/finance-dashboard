// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { loadRules } from '../../../src/main/categorize/rules';
import { buildPassthroughDetector } from '../../../src/main/categorize/passthrough';
import { resolveImportCategory } from '../../../src/main/categorize/resolveImportCategory';

let db: DatabaseSync;

function seedCategorized(id: string, labelClean: string, amount: number, categoryId: string): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', ?, ?, ?, ?, 1)`,
  ).run(id, id, amount, labelClean, labelClean, categoryId);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('resolveImportCategory', () => {
  it('passthrough: matches a learned (label, amount), ignoring label history', () => {
    seedCategorized('p1', 'PRLV SEPA PAYPAL EUROPE', -17.2, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'PRLV SEPA PAYPAL EUROPE', -17.2, loadRules(db), is);
    expect(res).toEqual({ categoryId: 'cat-alimentation', ruleId: null });
  });

  it('passthrough with an unseen amount stays uncategorized', () => {
    seedCategorized('p1', 'PRLV SEPA PAYPAL EUROPE', -17.2, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'PRLV SEPA PAYPAL EUROPE', -43, loadRules(db), is);
    expect(res).toEqual({ categoryId: null, ruleId: null });
  });

  it('non-passthrough uses label history', () => {
    seedCategorized('c1', 'CARREFOUR MARKET', -10, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'CARREFOUR MARKET', -99, loadRules(db), is);
    expect(res).toEqual({ categoryId: 'cat-alimentation', ruleId: null }); // amount irrelevant for normal labels
  });
});
