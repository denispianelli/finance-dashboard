import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { aggregateByCategory } from '../../../src/main/taxonomy/resolve';

/**
 * Multi-year scenario for the as-of resolver / aggregation.
 *
 * Why we INSERT taxonomy_events directly here instead of calling
 * renameCategory / splitCategory: those ops stamp `occurred_at` with
 * `datetime('now')`. In a real multi-year scenario the event timestamps
 * matter relative to transaction dates — so we set them explicitly to
 * reproduce a 2024–2026 timeline without time-travelling the system clock.
 * The ops themselves are exercised by their own unit tests in T2.
 */
function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedCat(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

function seedTx(
  db: DatabaseSync,
  id: string,
  date: string,
  amount: number,
  label: string,
  categoryId: string,
): void {
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id)
     VALUES (?, 'acc-lcl-default', ?, ?, ?, ?, ?, ?)`,
  ).run(id, `h-${id}`, date, amount, label, label, categoryId);
}

describe('taxonomy multi-year integration', () => {
  it('aggregates a 3-year window honestly across rename + split events', () => {
    const db = freshDb();

    // Initial taxonomy
    seedCat(db, 'restaurants', 'Restaurants');
    seedCat(db, 'transport', 'Transport');

    // Year 1 transactions (under original "Restaurants")
    seedTx(db, 'tx-y1-1', '2024-02-10', -32, 'Bistro A', 'restaurants');
    seedTx(db, 'tx-y1-2', '2024-05-15', -45, 'UBER EATS', 'restaurants');
    seedTx(db, 'tx-y1-3', '2024-09-20', -12, 'Metro', 'transport');

    // Mid-Year 2 (2025-01-01): rename "Restaurants" → "Food"
    db.prepare(
      `INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at)
       VALUES ('ev-rename', 1, 'rename', '["restaurants"]', '["restaurants"]', ?, '2025-01-01')`,
    ).run(JSON.stringify({ kind: 'rename', old_name: 'Restaurants', new_name: 'Food' }));
    db.prepare("UPDATE categories SET name = 'Food' WHERE id = 'restaurants'").run();

    // Year 2 transactions (under renamed "Food", same id)
    seedTx(db, 'tx-y2-1', '2025-03-12', -28, 'Bistro B', 'restaurants');
    seedTx(db, 'tx-y2-2', '2025-08-04', -55, 'Uber Eats Lunch', 'restaurants');
    seedTx(db, 'tx-y2-3', '2025-11-18', -8, 'Bus', 'transport');

    // Mid-Year 3 (2026-01-01): split "Food" → ["Restaurants only", "Food delivery"]
    seedCat(db, 'restaurants-only', 'Restaurants only');
    seedCat(db, 'food-delivery', 'Food delivery');
    db.prepare(
      `INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at)
       VALUES ('ev-split', 2, 'split', '["restaurants"]', '["restaurants-only","food-delivery"]', ?, '2026-01-01')`,
    ).run(
      JSON.stringify({
        kind: 'label-regex',
        rules: [
          { pattern: '(?i)uber|deliveroo', target_id: 'food-delivery' },
          { pattern: '.*', target_id: 'restaurants-only' },
        ],
      }),
    );
    db.prepare(
      `UPDATE categories SET deprecated_at = '2026-01-01', replaced_by_event_id = 'ev-split' WHERE id = 'restaurants'`,
    ).run();

    // Year 3 transactions on the NEW targets directly
    seedTx(db, 'tx-y3-1', '2026-02-01', -22, 'Bistro C', 'restaurants-only');
    seedTx(db, 'tx-y3-2', '2026-04-10', -18, 'Deliveroo dinner', 'food-delivery');
    seedTx(db, 'tx-y3-3', '2026-07-25', -9, 'Metro', 'transport');

    // ── as_of_period: Y1 txs show old "Restaurants", Y2 txs show "Food",
    //    Y3 txs show their new target names. Same id can land in multiple buckets.
    const period = aggregateByCategory(db, {
      from: '2024-01-01',
      to: '2026-12-31',
      mode: 'as_of_period',
    });
    const periodByKey = new Map(period.map((b) => [`${b.categoryId}::${b.name}`, b]));
    expect(periodByKey.get('restaurants::Restaurants')).toEqual({
      categoryId: 'restaurants',
      name: 'Restaurants',
      total: -32 + -45,
      count: 2,
    });
    expect(periodByKey.get('restaurants::Food')).toEqual({
      categoryId: 'restaurants',
      name: 'Food',
      total: -28 + -55,
      count: 2,
    });
    expect(periodByKey.get('transport::Transport')).toEqual({
      categoryId: 'transport',
      name: 'Transport',
      total: -12 + -8 + -9,
      count: 3,
    });
    expect(periodByKey.get('restaurants-only::Restaurants only')).toEqual({
      categoryId: 'restaurants-only',
      name: 'Restaurants only',
      total: -22,
      count: 1,
    });
    expect(periodByKey.get('food-delivery::Food delivery')).toEqual({
      categoryId: 'food-delivery',
      name: 'Food delivery',
      total: -18,
      count: 1,
    });

    // ── as_of_now: ALL historical "restaurants" txs re-routed via split rule.
    //    "UBER EATS" + "Uber Eats Lunch" + "Deliveroo dinner" → food-delivery
    //    Plain "Bistro" labels → restaurants-only
    const now = aggregateByCategory(db, {
      from: '2024-01-01',
      to: '2026-12-31',
      mode: 'as_of_now',
    });
    const nowByKey = new Map(now.map((b) => [b.categoryId, b]));
    expect(nowByKey.get('restaurants-only')).toEqual({
      categoryId: 'restaurants-only',
      name: 'Restaurants only',
      total: -32 + -28 + -22,
      count: 3,
    });
    expect(nowByKey.get('food-delivery')).toEqual({
      categoryId: 'food-delivery',
      name: 'Food delivery',
      total: -45 + -55 + -18,
      count: 3,
    });
    expect(nowByKey.get('transport')).toEqual({
      categoryId: 'transport',
      name: 'Transport',
      total: -12 + -8 + -9,
      count: 3,
    });
    // Sanity: as_of_now never produces the deprecated id
    expect([...nowByKey.keys()]).not.toContain('restaurants');

    // Conservation: totals + counts match across both modes (no transactions dropped)
    const sumTotals = (a: typeof now) => a.reduce((s, b) => s + b.total, 0);
    const sumCounts = (a: typeof now) => a.reduce((s, b) => s + b.count, 0);
    expect(sumTotals(period)).toEqual(sumTotals(now));
    expect(sumCounts(period)).toEqual(sumCounts(now));
    db.close();
  });
});
