import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('default categories + rules seed (migration 006)', () => {
  it('seeds the 16 default categories', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const { n } = db.prepare('SELECT count(*) n FROM categories WHERE is_default = 1').get() as {
      n: number;
    };
    expect(n).toBe(16);
    db.close();
  });

  it('seeds a known category with its icon and color', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT name, icon, color FROM categories WHERE id = ?').get(
      'cat-alimentation',
    ) as { name: string; icon: string; color: string } | undefined;
    expect(row).toMatchObject({ name: 'Alimentation', icon: 'shop' });
    expect(row?.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    db.close();
  });

  it('seeds rules that reference existing categories (FK-valid)', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const { orphans } = db
      .prepare(
        `SELECT count(*) orphans FROM categorization_rules r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE c.id IS NULL`,
      )
      .get() as { orphans: number };
    expect(orphans).toBe(0);
    db.close();
  });

  it('records version 6 and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(6);
    const { n } = db.prepare('SELECT count(*) n FROM categories WHERE is_default = 1').get() as {
      n: number;
    };
    expect(n).toBe(16);
    db.close();
  });
});
