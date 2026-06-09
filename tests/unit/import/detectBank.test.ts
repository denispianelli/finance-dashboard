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

  it('does not match a signature that only appears in a transaction label', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    // A non-LCL statement: the masthead has Date/Débit/Crédit headers, and the
    // string "CREDIT LYONNAIS" appears only in a transfer label below them.
    const pages: PdfPage[] = [
      {
        pageNumber: 1,
        items: [
          { str: 'RELEVE BOURSORAMA', x: 0, y: 100, width: 0 },
          { str: 'Date', x: 10, y: 50, width: 0 },
          { str: 'Débit', x: 200, y: 50, width: 0 },
          { str: 'Crédit', x: 300, y: 50, width: 0 },
          { str: 'VIR CREDIT LYONNAIS JEAN', x: 50, y: 30, width: 0 },
        ],
      },
    ];
    expect(detectBank(db, pages)).toBeNull();
    db.close();
  });

  it('returns null when no known signature is present', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const result = detectBank(db, [pageWith('SOME OTHER BANK STATEMENT')]);
    expect(result).toBeNull();
    db.close();
  });

  it('returns null when the bank matches but has no v1 mapping', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.prepare(
      "INSERT INTO banks(id, name, detected_signature) VALUES('newbank','New Bank','NEW BANK HEADER')",
    ).run();
    const result = detectBank(db, [pageWith('PDF WITH NEW BANK HEADER')]);
    expect(result).toBeNull();
    db.close();
  });
});
