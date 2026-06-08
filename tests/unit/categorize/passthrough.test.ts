import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { buildPassthroughDetector } from '../../../src/main/categorize/passthrough';

let db: DatabaseSync;

function insertUserCat(label: string, categoryId: string): void {
  const id = `t-${label}-${categoryId}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, ?, 1)`,
  ).run(id, id, label, label.toUpperCase(), categoryId);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('buildPassthroughDetector', () => {
  it('flags seed payees by whole token, regardless of history', () => {
    const is = buildPassthroughDetector(db);
    expect(is('PRLV SEPA PAYPAL EUROPE')).toBe(true);
    expect(is('CB SUMUP PILLAJO')).toBe(true);
    expect(is('CB CARREFOUR MARKET')).toBe(false);
  });

  it('does not match a seed token embedded in a longer word', () => {
    const is = buildPassthroughDetector(db);
    expect(is('CB PAYPALOOZA FESTIVAL')).toBe(false); // "PAYPALOOZA" != token "PAYPAL"
  });

  it('flags a key the user filed under >=2 distinct categories (entropy)', () => {
    insertUserCat('MYSTORE', 'cat-alimentation');
    insertUserCat('MYSTORE', 'cat-loisirs'); // same label_clean, a second distinct category
    const is = buildPassthroughDetector(db);
    expect(is('MYSTORE')).toBe(true);
  });

  it('does not flag a key with a single user category', () => {
    insertUserCat('ONESHOP', 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    expect(is('ONESHOP')).toBe(false);
  });
});
