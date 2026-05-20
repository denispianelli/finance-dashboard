import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { splitCategory } from '../../../src/main/taxonomy/splitCategory';
import type { MappingRule } from '@shared/types/taxonomy';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function seedCategory(db: DatabaseSync, id: string, name: string): void {
  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
}

const exhaustiveRule = (...pairs: [string, string][]): MappingRule => ({
  kind: 'label-regex',
  rules: pairs.map(([pattern, target_id]) => ({ pattern, target_id })),
});

describe('splitCategory', () => {
  it('deprecates the source, links it to the split event, and persists the mapping rule', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'Restaurants');
    seedCategory(db, 't1', 'Transport');
    seedCategory(db, 't2', 'Restaurants only');
    const rule = exhaustiveRule(['(?i)uber', 't1'], ['.*', 't2']);

    const eventId = splitCategory(db, {
      sourceId: 'src',
      targetIds: ['t1', 't2'],
      mappingRule: rule,
    });

    const cat = db
      .prepare('SELECT deprecated_at, replaced_by_event_id FROM categories WHERE id = ?')
      .get('src') as unknown as {
      deprecated_at: string | null;
      replaced_by_event_id: string | null;
    };
    expect(cat.deprecated_at).not.toBeNull();
    expect(cat.replaced_by_event_id).toBe(eventId);

    const event = db
      .prepare('SELECT kind, source_ids, target_ids, payload FROM taxonomy_events WHERE id = ?')
      .get(eventId) as unknown as {
      kind: string;
      source_ids: string;
      target_ids: string;
      payload: string;
    };
    expect(event.kind).toBe('split');
    expect(JSON.parse(event.source_ids)).toEqual(['src']);
    expect(JSON.parse(event.target_ids)).toEqual(['t1', 't2']);
    expect(JSON.parse(event.payload)).toEqual(rule);
    db.close();
  });

  it('throws when source is missing', () => {
    const db = freshDb();
    seedCategory(db, 't1', 'A');
    seedCategory(db, 't2', 'B');
    expect(() =>
      splitCategory(db, {
        sourceId: 'missing',
        targetIds: ['t1', 't2'],
        mappingRule: exhaustiveRule(['.*', 't1']),
      }),
    ).toThrow(/source.*not found/);
    db.close();
  });

  it('throws when source is already deprecated', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    seedCategory(db, 't2', 'B');
    db.prepare("UPDATE categories SET deprecated_at = datetime('now') WHERE id = 'src'").run();
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1', 't2'],
        mappingRule: exhaustiveRule(['.*', 't1']),
      }),
    ).toThrow(/deprecated/);
    db.close();
  });

  it('throws when a target does not exist', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1', 'missing'],
        mappingRule: exhaustiveRule(['.*', 't1']),
      }),
    ).toThrow(/target.*missing/);
    db.close();
  });

  it('throws when a target is deprecated', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    seedCategory(db, 't2', 'B');
    db.prepare("UPDATE categories SET deprecated_at = datetime('now') WHERE id = 't2'").run();
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1', 't2'],
        mappingRule: exhaustiveRule(['.*', 't1']),
      }),
    ).toThrow(/target.*deprecated/);
    db.close();
  });

  it('throws when targetIds.length < 2', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1'],
        mappingRule: exhaustiveRule(['.*', 't1']),
      }),
    ).toThrow(/at least 2 targets/);
    db.close();
  });

  it('throws when the mapping rule is not exhaustive (last pattern != ".*")', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    seedCategory(db, 't2', 'B');
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1', 't2'],
        mappingRule: exhaustiveRule(['(?i)uber', 't1'], ['(?i)deliveroo', 't2']),
      }),
    ).toThrow(/exhaustive/);
    db.close();
  });

  it('throws when a mapping rule target_id is not in targetIds', () => {
    const db = freshDb();
    seedCategory(db, 'src', 'X');
    seedCategory(db, 't1', 'A');
    seedCategory(db, 't2', 'B');
    expect(() =>
      splitCategory(db, {
        sourceId: 'src',
        targetIds: ['t1', 't2'],
        mappingRule: exhaustiveRule(['(?i)uber', 'unknown'], ['.*', 't1']),
      }),
    ).toThrow(/mapping rule target_id.*unknown/);
    db.close();
  });
});
