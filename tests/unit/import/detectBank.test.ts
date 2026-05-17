import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { detectBank } from '../../../src/main/import/detectBank';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

function pageWith(text: string): PdfPage {
  return { pageNumber: 1, items: [{ str: text, x: 0, y: 0, width: 0 }] };
}

describe('detectBank', () => {
  it('detects LCL from the CREDIT LYONNAIS signature and returns its mapping', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const result = detectBank(db, [pageWith('RELEVE DE COMPTE CREDIT LYONNAIS PARIS')]);
    expect(result).not.toBeNull();
    expect(result?.bankId).toBe('lcl');
    expect(result?.mapping).toEqual({
      date_col: 42,
      label_col: 75,
      debit_col: 433,
      credit_col: 504,
      balance_col: null,
    });
    db.close();
  });

  it('returns null when no known signature is present', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const result = detectBank(db, [pageWith('SOME OTHER BANK STATEMENT')]);
    expect(result).toBeNull();
    db.close();
  });
});
