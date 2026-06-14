import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { INTEREST_LOAN_CATEGORY } from '../../../src/renderer/lib/loanSplit';

describe("Intérêts d'emprunt category stays in sync", () => {
  it('matches the seeded row (migration 022)', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db
      .prepare('SELECT id, name, color FROM categories WHERE id = ?')
      .get(INTEREST_LOAN_CATEGORY.id) as { id: string; name: string; color: string } | undefined;
    expect(row).toEqual({
      id: INTEREST_LOAN_CATEGORY.id,
      name: INTEREST_LOAN_CATEGORY.name,
      color: INTEREST_LOAN_CATEGORY.color,
    });
    db.close();
  });
});
