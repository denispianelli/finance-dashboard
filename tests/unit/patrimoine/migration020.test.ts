import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

function cols(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);
}

describe('migration 020', () => {
  it('creates loans, loan_installments and assets with the expected columns', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(cols(db, 'loans')).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'principal',
        'nominal_rate',
        'term_months',
        'share',
        'loan_number',
      ]),
    );
    expect(cols(db, 'loan_installments')).toEqual(
      expect.arrayContaining(['loan_id', 'seq', 'due_date', 'balance_after', 'payment']),
    );
    expect(cols(db, 'assets')).toEqual(
      expect.arrayContaining(['kind', 'declared_value', 'share', 'valued_at']),
    );
    db.close();
  });

  it('defaults share to 0.5 on loans and assets', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.prepare(
      "INSERT INTO loans (id, name, principal, nominal_rate, start_date, term_months) VALUES ('l1','x',1000,2,'2020-01-01',12)",
    ).run();
    const row = db.prepare('SELECT share FROM loans WHERE id = ?').get('l1') as { share: number };
    expect(row.share).toBe(0.5);
    db.close();
  });
});
