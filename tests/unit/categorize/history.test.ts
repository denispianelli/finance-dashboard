import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { buildHistoryIndex } from '../../../src/main/categorize/history';
import { stableLabelKey } from '../../../src/main/categorize/labelKey';

let db: DatabaseSync;

function seed(
  id: string,
  labelClean: string,
  amount: number,
  categoryId: string,
  userModified = 1,
): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', ?, ?, ?, ?, ?)`,
  ).run(id, id, amount, labelClean, labelClean, categoryId, userModified);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('buildHistoryIndex — byLabel', () => {
  it('propagates a correction to labels differing only by their date', () => {
    // Audit #184: exact label_clean matching meant labels embedding a date
    // never repeated, so corrections mostly did not stick.
    seed('t1', 'VIREMENT M JEAN DUPONT 12/03/25', -50, 'cat-transferts');
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('VIREMENT M JEAN DUPONT 14/05/25'))).toBe(
      'cat-transferts',
    );
  });

  it('propagates across LCL dot-dated card labels', () => {
    seed('t1', 'CB TICKETMASTER 13.10.25', -80, 'cat-loisirs');
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('CB TICKETMASTER 14.11.25'))).toBe('cat-loisirs');
  });

  it('prefers a user correction over more frequent auto-categorizations', () => {
    seed('a1', 'CB CARREFOUR 01/01/26', -10, 'cat-alimentation', 0);
    seed('a2', 'CB CARREFOUR 02/01/26', -12, 'cat-alimentation', 0);
    seed('a3', 'CB CARREFOUR 03/01/26', -14, 'cat-alimentation', 0);
    seed('u1', 'CB CARREFOUR 04/01/26', -16, 'cat-sante', 1);
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('CB CARREFOUR 05/01/26'))).toBe('cat-sante');
  });

  it('breaks ties between corrections on frequency', () => {
    seed('u1', 'CB FNAC 01/01/26', -10, 'cat-loisirs', 1);
    seed('u2', 'CB FNAC 02/01/26', -12, 'cat-loisirs', 1);
    seed('u3', 'CB FNAC 03/01/26', -14, 'cat-transport', 1);
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('CB FNAC 04/01/26'))).toBe('cat-loisirs');
  });

  it('returns null for an unseen key', () => {
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('CB INCONNU'))).toBeNull();
  });

  it('does not conflate distinct payees', () => {
    seed('t1', 'CB CARREFOUR MARKET', -10, 'cat-alimentation');
    const history = buildHistoryIndex(db);
    expect(history.byLabel(stableLabelKey('CB AUCHAN'))).toBeNull();
  });
});

describe('buildHistoryIndex — byLabelAmount', () => {
  it('returns the learned category for the same key + exact amount (to the cent)', () => {
    seed('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    const history = buildHistoryIndex(db);
    expect(history.byLabelAmount(stableLabelKey('PAYPAL'), -17.2)).toBe('cat-alimentation');
  });

  it('matches dated passthrough labels through the stable key', () => {
    seed('p1', 'PRLV PAYPAL EUROPE 12/03/25', -17.2, 'cat-abonnements');
    const history = buildHistoryIndex(db);
    expect(history.byLabelAmount(stableLabelKey('PRLV PAYPAL EUROPE 14/05/25'), -17.2)).toBe(
      'cat-abonnements',
    );
  });

  it('does not match a different amount', () => {
    seed('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    const history = buildHistoryIndex(db);
    expect(history.byLabelAmount(stableLabelKey('PAYPAL'), -43)).toBeNull();
  });

  it('does not match a different label', () => {
    seed('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    const history = buildHistoryIndex(db);
    expect(history.byLabelAmount(stableLabelKey('SUMUP'), -17.2)).toBeNull();
  });

  it('returns null when nothing was learned', () => {
    const history = buildHistoryIndex(db);
    expect(history.byLabelAmount(stableLabelKey('PAYPAL'), -17.2)).toBeNull();
  });
});
