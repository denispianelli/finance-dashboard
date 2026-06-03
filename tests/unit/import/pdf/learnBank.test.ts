import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import {
  slugifyBank,
  learnBankMapping,
  persistLearnedBank,
} from '../../../../src/main/import/pdf/learnBank';
import { detectBank } from '../../../../src/main/import/detectBank';
import type { ColumnOrder } from '../../../../src/main/import/pdf/inferColumns';
import type { PdfPage, PdfTextItem } from '../../../../src/main/import/pdf/extract';

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: 0 };
}

describe('slugifyBank', () => {
  it('produces an id-safe accent-stripped slug', () => {
    expect(slugifyBank('Société Générale')).toBe('societe-generale');
    expect(slugifyBank('  BNP Paribas! ')).toBe('bnp-paribas');
    expect(slugifyBank('???')).toBe('bank');
  });
});

describe('learnBankMapping', () => {
  it('derives a mapping from a sample statement using injected inference', async () => {
    const order: ColumnOrder = { date: 1, valeur: 2, label: 3, debit: 4, credit: 5, balance: 6 };
    const pages: PdfPage[] = [
      {
        pageNumber: 1,
        items: [
          item('10/06/10', 37, 90),
          item('10/06/10', 87, 90),
          item('VIR RECU', 136, 90),
          item('109,43', 534, 90),
          item('30,65', 470, 80),
        ],
      },
    ];
    const mapping = await learnBankMapping(pages, () => Promise.resolve(order));
    expect(mapping).not.toBeNull();
    if (!mapping) return;
    expect(470).toBeGreaterThanOrEqual(mapping.debit_col);
    expect(534).toBeGreaterThanOrEqual(mapping.credit_col);
  });

  it('returns null when inference fails', async () => {
    const pages: PdfPage[] = [{ pageNumber: 1, items: [item('10/06/10', 37, 90)] }];
    expect(await learnBankMapping(pages, () => Promise.resolve(null))).toBeNull();
  });
});

describe('persistLearnedBank + detectBank', () => {
  function freshDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    return db;
  }

  it('makes a learned bank detectable on later imports', () => {
    const db = freshDb();
    persistLearnedBank(db, {
      bankId: 'societe-generale',
      name: 'Société Générale',
      signature: 'Société Générale',
      mapping: { date_col: 37, label_col: 136, debit_col: 470, credit_col: 527, balance_col: null },
    });

    const pages: PdfPage[] = [
      { pageNumber: 1, items: [item('Société Générale Relevé de compte', 28, 700)] },
    ];
    const detected = detectBank(db, pages);
    expect(detected?.bankId).toBe('societe-generale');
    expect(detected?.mapping).toMatchObject({ debit_col: 470, credit_col: 527 });
    db.close();
  });

  it('detects case- and accent-insensitively', () => {
    const db = freshDb();
    persistLearnedBank(db, {
      bankId: 'societe-generale',
      name: 'Société Générale',
      signature: 'Société Générale',
      mapping: { date_col: 1, label_col: 2, debit_col: 3, credit_col: 4, balance_col: null },
    });
    const pages: PdfPage[] = [{ pageNumber: 1, items: [item('paiement SOCIETE GENERALE sa', 0, 0)] }];
    expect(detectBank(db, pages)?.bankId).toBe('societe-generale');
    db.close();
  });
});
