import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAmountHistoryCategory } from '../../../src/main/categorize/history';

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

describe('findAmountHistoryCategory', () => {
  it('returns the learned category for the same label + exact amount (to the cent)', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'PAYPAL', -17.2)).toBe('cat-alimentation');
  });

  it('does not match a different amount', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'PAYPAL', -43)).toBeNull();
  });

  it('does not match a different label', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'SUMUP', -17.2)).toBeNull();
  });

  it('returns null when nothing was learned', () => {
    expect(findAmountHistoryCategory(db, 'PAYPAL', -17.2)).toBeNull();
  });
});
