import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 022', () => {
  it('adds transactions.loan_installment_id', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(cols).toContain('loan_installment_id');
    db.close();
  });

  it('seeds the "Intérêts d\'emprunt" category', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db
      .prepare("SELECT name, color FROM categories WHERE id = 'cat-interets-emprunt'")
      .get() as { name: string; color: string } | undefined;
    expect(row?.name).toBe("Intérêts d'emprunt");
    expect(row?.color).toBe('#C58B5C');
    db.close();
  });
});
