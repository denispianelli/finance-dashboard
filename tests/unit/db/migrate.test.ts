import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, LATEST_SCHEMA_VERSION } from '../../../src/main/db/migrate';

describe('runMigrations', () => {
  it('creates all tables on a fresh database', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toContain('accounts');
    expect(tables).toContain('transactions');
    expect(tables).toContain('categories');
    expect(tables).toContain('imports');
    expect(tables).toContain('bank_column_mappings');
    expect(tables).toContain('categorization_rules');
    expect(tables).toContain('app_settings');
    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(() => {
      runMigrations(db);
    }).not.toThrow();
    db.close();
  });

  it('records applied versions in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(1);
    db.close();
  });

  it('migration 005 creates taxonomy_events with event_seq + index', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toContain('taxonomy_events');

    const cols = (
      db.prepare('PRAGMA table_info(taxonomy_events)').all() as {
        name: string;
        notnull: number;
        pk: number;
      }[]
    ).reduce<Record<string, { notnull: number; pk: number }>>((acc, c) => {
      acc[c.name] = { notnull: c.notnull, pk: c.pk };
      return acc;
    }, {});
    expect(cols).toMatchObject({
      id: { notnull: 0, pk: 1 },
      event_seq: { notnull: 1, pk: 0 },
      kind: { notnull: 1, pk: 0 },
      source_ids: { notnull: 1, pk: 0 },
      target_ids: { notnull: 1, pk: 0 },
      payload: { notnull: 0, pk: 0 },
      occurred_at: { notnull: 1, pk: 0 },
    });

    const indexes = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='taxonomy_events'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(indexes).toContain('idx_taxonomy_events_seq');

    db.close();
  });

  it('migration 005 enforces kind CHECK and event_seq UNIQUE', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);

    expect(() => {
      db.exec(
        "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids) VALUES ('e1', 1, 'bogus', '[]', '[]')",
      );
    }).toThrow();

    db.exec(
      "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids) VALUES ('e1', 1, 'rename', '[\"c1\"]', '[\"c1\"]')",
    );
    // distinct id so the failure is specifically the event_seq UNIQUE constraint, not the PK
    expect(() => {
      db.exec(
        "INSERT INTO taxonomy_events (id, event_seq, kind, source_ids, target_ids) VALUES ('e2', 1, 'rename', '[\"c1\"]', '[\"c1\"]')",
      );
    }).toThrow(/UNIQUE/);

    db.close();
  });

  it('migration 005 adds deprecated_at + replaced_by_event_id on categories', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);

    const cols = (
      db.prepare('PRAGMA table_info(categories)').all() as {
        name: string;
        notnull: number;
      }[]
    ).map((c) => c.name);
    expect(cols).toContain('deprecated_at');
    expect(cols).toContain('replaced_by_event_id');
  });
});

describe('LATEST_SCHEMA_VERSION', () => {
  it('matches the max applied migration version', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
      v: number;
    };
    expect(LATEST_SCHEMA_VERSION).toBe(row.v);
    db.close();
  });
});
