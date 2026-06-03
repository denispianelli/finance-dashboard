import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import sql007 from '../../../src/main/db/migrations/007_drop_transfer_label_rules.sql?raw';

describe('drop transfer label rules (migration 007)', () => {
  it('removes the fragile internal-transfer label rules', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const { n } = db
      .prepare("SELECT count(*) n FROM categorization_rules WHERE category_id = 'cat-transferts'")
      .get() as { n: number };
    expect(n).toBe(0);
    db.close();
  });

  it('keeps the "Transferts internes" category for manual tagging', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT name FROM categories WHERE id = ?').get('cat-transferts') as
      | { name: string }
      | undefined;
    expect(row).toMatchObject({ name: 'Transferts internes' });
    db.close();
  });

  it('records version 7', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(7);
    db.close();
  });

  it('re-opens auto-filed transfers but preserves the user’s own choices', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('PRAGMA foreign_keys = ON');
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Compte', 'checking')").run();

    // An auto-filed transfer (rule-assigned, untouched by the user)...
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
       VALUES ('auto', 'a1', 'auto', '2026-05-04', -500, 'VIREMENT INTERNE', 'VIREMENT INTERNE', 'cat-transferts', 0)`,
    ).run();
    // ...and one the user explicitly tagged as a transfer.
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
       VALUES ('mine', 'a1', 'mine', '2026-05-05', -500, 'VERS LIVRET', 'VERS LIVRET', 'cat-transferts', 1)`,
    ).run();

    // Re-apply the migration body (idempotent) to exercise the data reset.
    db.exec(sql007);

    const auto = db.prepare("SELECT category_id FROM transactions WHERE id = 'auto'").get() as {
      category_id: string | null;
    };
    const mine = db.prepare("SELECT category_id FROM transactions WHERE id = 'mine'").get() as {
      category_id: string | null;
    };
    expect(auto.category_id).toBeNull();
    expect(mine.category_id).toBe('cat-transferts');
    db.close();
  });
});
