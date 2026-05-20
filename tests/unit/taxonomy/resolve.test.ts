import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { resolveCategoryAsOf } from '../../../src/main/taxonomy/resolve';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedCategory(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

describe('resolveCategoryAsOf — identity passthrough', () => {
  it('as_of_now returns {id, name} from categories.name when no events exist', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_now');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('as_of_period returns {id, name} from categories.name when no events exist', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-01-01');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('throws when category does not exist', () => {
    const db = freshDb();
    expect(() => resolveCategoryAsOf(db, 'missing', 'as_of_now')).toThrow(/not found/);
    db.close();
  });
});

describe('resolveCategoryAsOf — as_of_period rename walk', () => {
  it('throws when date arg is missing', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    expect(() => resolveCategoryAsOf(db, 'c1', 'as_of_period')).toThrow(/date is required/);
    db.close();
  });

  it('returns current name when no rename event exists', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    const r = resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-05-15');
    expect(r).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('returns the historical name after one rename at the renamed time', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    // rename event at 2026-03-01: payload {old_name: Restaurants, new_name: Food}
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-03-01')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'Restaurants', new_name: 'Food' }));
    db.prepare("UPDATE categories SET name = 'Food' WHERE id = 'c1'").run();

    // at 2026-03-15 (after rename) → Food
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-03-15')).toEqual({
      id: 'c1',
      name: 'Food',
    });
    // at 2026-02-01 (before rename) → original Restaurants
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-02-01')).toEqual({
      id: 'c1',
      name: 'Restaurants',
    });
    db.close();
  });

  it('returns the latest rename effective at date with multiple renames', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-01-15')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'A', new_name: 'B' }));
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e2', 2, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-03-15')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'B', new_name: 'C' }));
    db.prepare("UPDATE categories SET name = 'C' WHERE id = 'c1'").run();

    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-01-01')).toEqual({
      id: 'c1',
      name: 'A',
    });
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-02-15')).toEqual({
      id: 'c1',
      name: 'B',
    });
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_period', '2026-04-15')).toEqual({
      id: 'c1',
      name: 'C',
    });
    db.close();
  });
});

describe('resolveCategoryAsOf — as_of_now base (renames update in place)', () => {
  it('returns categories.name when no events touch the category', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    expect(resolveCategoryAsOf(db, 'c1', 'as_of_now')).toEqual({ id: 'c1', name: 'Restaurants' });
    db.close();
  });

  it('returns the current name after one rename (categories.name reflects it)', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?)",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'Restaurants', new_name: 'Food' }));
    db.prepare("UPDATE categories SET name = 'Food' WHERE id = 'c1'").run();

    expect(resolveCategoryAsOf(db, 'c1', 'as_of_now')).toEqual({ id: 'c1', name: 'Food' });
    db.close();
  });

  it('returns the latest name after two renames', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?)",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'A', new_name: 'B' }));
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e2', 2, 'rename', '[\"c1\"]', '[\"c1\"]', ?)",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'B', new_name: 'C' }));
    db.prepare("UPDATE categories SET name = 'C' WHERE id = 'c1'").run();

    expect(resolveCategoryAsOf(db, 'c1', 'as_of_now')).toEqual({ id: 'c1', name: 'C' });
    db.close();
  });
});

describe('resolveCategoryAsOf — as_of_now merge recursion', () => {
  it('returns target {id, name} when source was merged', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'a2', 'A2');
    seedCategory(db, 'b', 'B');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e1', 1, 'merge', '[\"a\",\"a2\"]', '[\"b\"]', NULL)",
    ).run();
    db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = 'e1' WHERE id IN ('a','a2')",
    ).run();
    expect(resolveCategoryAsOf(db, 'a', 'as_of_now')).toEqual({ id: 'b', name: 'B' });
    expect(resolveCategoryAsOf(db, 'a2', 'as_of_now')).toEqual({ id: 'b', name: 'B' });
    db.close();
  });

  it('follows a rename of the merge target', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'b', 'B');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e1', 1, 'merge', '[\"a\"]', '[\"b\"]', NULL)",
    ).run();
    db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = 'e1' WHERE id = 'a'",
    ).run();
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e2', 2, 'rename', '[\"b\"]', '[\"b\"]', ?)",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'B', new_name: 'B-renamed' }));
    db.prepare("UPDATE categories SET name = 'B-renamed' WHERE id = 'b'").run();
    expect(resolveCategoryAsOf(db, 'a', 'as_of_now')).toEqual({ id: 'b', name: 'B-renamed' });
    db.close();
  });

  it('walks chained merges A -> B -> C', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'b', 'B');
    seedCategory(db, 'c', 'C');
    // A and some-other merged into B
    seedCategory(db, 'a2', 'A2');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e1', 1, 'merge', '[\"a\",\"a2\"]', '[\"b\"]', NULL)",
    ).run();
    db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = 'e1' WHERE id IN ('a','a2')",
    ).run();
    // B and some-other merged into C
    seedCategory(db, 'b2', 'B2');
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e2', 2, 'merge', '[\"b\",\"b2\"]', '[\"c\"]', NULL)",
    ).run();
    db.prepare(
      "UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = 'e2' WHERE id IN ('b','b2')",
    ).run();

    expect(resolveCategoryAsOf(db, 'a', 'as_of_now')).toEqual({ id: 'c', name: 'C' });
    expect(resolveCategoryAsOf(db, 'b', 'as_of_now')).toEqual({ id: 'c', name: 'C' });
    db.close();
  });
});

describe('resolveCategoryAsOf — as_of_now split (one level deep)', () => {
  function seedSplit(
    db: DatabaseSync,
    eventId: string,
    eventSeq: number,
    sourceId: string,
    targetIds: string[],
  ): void {
    db.prepare(
      'INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      eventId,
      eventSeq,
      'split',
      JSON.stringify([sourceId]),
      JSON.stringify(targetIds),
      JSON.stringify({
        kind: 'label-regex',
        rules: [{ pattern: '.*', target_id: targetIds[0] }],
      }),
    );
    db.prepare(
      `UPDATE categories SET deprecated_at = datetime('now'), replaced_by_event_id = ? WHERE id = ?`,
    ).run(eventId, sourceId);
  }

  it('surfaces splitInto with terminal {id, name} entries', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'b', 'B');
    seedCategory(db, 'c', 'C');
    seedSplit(db, 'e1', 1, 'a', ['b', 'c']);
    const r = resolveCategoryAsOf(db, 'a', 'as_of_now');
    expect(r).toEqual({
      id: 'a',
      name: 'A',
      splitInto: [
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
    });
    db.close();
  });

  it('reflects a post-split rename of a target in splitInto', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'b', 'B');
    seedCategory(db, 'c', 'C');
    seedSplit(db, 'e1', 1, 'a', ['b', 'c']);
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload) VALUES ('e2', 2, 'rename', '[\"b\"]', '[\"b\"]', ?)",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'B', new_name: 'B-new' }));
    db.prepare("UPDATE categories SET name = 'B-new' WHERE id = 'b'").run();

    const r = resolveCategoryAsOf(db, 'a', 'as_of_now');
    expect(r).toEqual({
      id: 'a',
      name: 'A',
      splitInto: [
        { id: 'b', name: 'B-new' },
        { id: 'c', name: 'C' },
      ],
    });
    db.close();
  });

  it('chained split: outer surfaces inner target as terminal {id, name}, no nested splitInto', () => {
    const db = freshDb();
    seedCategory(db, 'a', 'A');
    seedCategory(db, 'b', 'B');
    seedCategory(db, 'c', 'C');
    seedCategory(db, 'd', 'D');
    seedCategory(db, 'e', 'E');
    seedSplit(db, 'e1', 1, 'a', ['b', 'c']);
    seedSplit(db, 'e2', 2, 'c', ['d', 'e']);
    const r = resolveCategoryAsOf(db, 'a', 'as_of_now');
    expect(r).toEqual({
      id: 'a',
      name: 'A',
      splitInto: [
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
    });
    // Caller would call resolveCategoryAsOf again on 'c' to walk further.
    const rc = resolveCategoryAsOf(db, 'c', 'as_of_now');
    expect(rc).toEqual({
      id: 'c',
      name: 'C',
      splitInto: [
        { id: 'd', name: 'D' },
        { id: 'e', name: 'E' },
      ],
    });
    db.close();
  });
});

import { aggregateByCategory } from '../../../src/main/taxonomy/resolve';

function seedTx(
  db: DatabaseSync,
  id: string,
  date: string,
  amount: number,
  label: string,
  categoryId: string | null,
): void {
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id)
     VALUES (?, 'acc-lcl-default', ?, ?, ?, ?, ?, ?)`,
  ).run(id, `h-${id}`, date, amount, label, label, categoryId);
}

describe('aggregateByCategory — as_of_period', () => {
  it('returns empty array when no transactions in window', () => {
    const db = freshDb();
    expect(
      aggregateByCategory(db, { from: '2026-01-01', to: '2026-12-31', mode: 'as_of_period' }),
    ).toEqual([]);
    db.close();
  });

  it('throws when mode is missing or invalid', () => {
    const db = freshDb();
    // @ts-expect-error — mode missing
    expect(() => aggregateByCategory(db, { from: '2026-01-01', to: '2026-12-31' })).toThrow(/mode/);
    // @ts-expect-error — mode invalid
    expect(() =>
      aggregateByCategory(db, { from: '2026-01-01', to: '2026-12-31', mode: 'magic' }),
    ).toThrow(/mode/);
    db.close();
  });

  it('buckets a single tx by its current category name when no events', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    seedTx(db, 'tx1', '2026-05-01', -42.5, 'Bistro X', 'c1');
    const buckets = aggregateByCategory(db, {
      from: '2026-01-01',
      to: '2026-12-31',
      mode: 'as_of_period',
    });
    expect(buckets).toEqual([{ categoryId: 'c1', name: 'Restaurants', total: -42.5, count: 1 }]);
    db.close();
  });

  it('separates buckets by historical name across a mid-period rename', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'Restaurants');
    // tx before rename
    seedTx(db, 'tx1', '2026-02-01', -10, 'Bistro A', 'c1');
    // rename on 2026-03-01
    db.prepare(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids, payload, occurred_at) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]', ?, '2026-03-01')",
    ).run(JSON.stringify({ kind: 'rename', old_name: 'Restaurants', new_name: 'Food' }));
    db.prepare("UPDATE categories SET name = 'Food' WHERE id = 'c1'").run();
    // tx after rename
    seedTx(db, 'tx2', '2026-04-01', -20, 'Bistro B', 'c1');

    const buckets = aggregateByCategory(db, {
      from: '2026-01-01',
      to: '2026-12-31',
      mode: 'as_of_period',
    });
    expect(buckets).toHaveLength(2);
    expect(buckets).toContainEqual({ categoryId: 'c1', name: 'Restaurants', total: -10, count: 1 });
    expect(buckets).toContainEqual({ categoryId: 'c1', name: 'Food', total: -20, count: 1 });
    db.close();
  });

  it('ignores transactions outside the window and with null category_id', () => {
    const db = freshDb();
    seedCategory(db, 'c1', 'A');
    seedTx(db, 'tx1', '2025-12-31', -5, 'x', 'c1'); // before window
    seedTx(db, 'tx2', '2026-06-01', -10, 'x', 'c1');
    seedTx(db, 'tx3', '2027-01-01', -15, 'x', 'c1'); // after window
    seedTx(db, 'tx4', '2026-06-15', -20, 'x', null); // null category
    const buckets = aggregateByCategory(db, {
      from: '2026-01-01',
      to: '2026-12-31',
      mode: 'as_of_period',
    });
    expect(buckets).toEqual([{ categoryId: 'c1', name: 'A', total: -10, count: 1 }]);
    db.close();
  });
});
