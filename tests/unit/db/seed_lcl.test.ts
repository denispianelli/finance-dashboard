import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('LCL seed (migration 002)', () => {
  it('inserts the LCL bank row', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM banks WHERE id = ?').get('lcl') as
      | { id: string; name: string; detected_signature: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe('lcl');
    expect(row?.name).toBe('Crédit Lyonnais');
    expect(row?.detected_signature).toBe('CREDIT LYONNAIS');
    db.close();
  });

  it('inserts the LCL column mapping', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM bank_column_mappings WHERE bank_id = ?').get('lcl') as
      | {
          bank_id: string;
          format_version: string;
          date_col: number;
          label_col: number;
          debit_col: number;
          credit_col: number;
          balance_col: number | null;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.format_version).toBe('v1');
    expect(row?.date_col).toBe(42);
    expect(row?.label_col).toBe(75);
    expect(row?.debit_col).toBe(433);
    expect(row?.credit_col).toBe(504);
    expect(row?.balance_col).toBeNull();
    db.close();
  });

  it('records version 2 in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(2);
    db.close();
  });
});
