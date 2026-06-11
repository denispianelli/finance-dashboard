import { describe, it, expect } from 'vitest';
import {
  suggestColumnOrder,
  validateColumnOrder,
} from '../../../../src/main/import/pdf/suggestColumns';
import type { PdfPage, PdfTextItem } from '../../../../src/main/import/pdf/extract';

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: 0 };
}

function page(items: PdfTextItem[]): PdfPage[] {
  return [{ pageNumber: 1, items }];
}

describe('suggestColumnOrder', () => {
  it('finds the header line and orders the columns by x', () => {
    const pages = page([
      item('Relevé de compte', 40, 700),
      // header line (same y)
      item('Date', 40, 650),
      item('Valeur', 90, 650),
      item('Libellé', 140, 650),
      item('Débit', 420, 650),
      item('Crédit', 480, 650),
      item('Solde', 540, 650),
      // a transaction row
      item('10/06/26', 40, 630),
    ]);

    expect(suggestColumnOrder(pages)).toEqual({
      order: { date: 1, valeur: 2, label: 3, debit: 4, credit: 5, balance: 6 },
      headerTokens: ['Date', 'Valeur', 'Libellé', 'Débit', 'Crédit', 'Solde'],
    });
  });

  it('matches aliases accent-insensitively and tolerates a partial header', () => {
    const pages = page([
      item('DATE', 40, 650),
      item('NATURE', 120, 650.8), // y within tolerance; NATURE → label
      item('DEBIT', 420, 649.5),
    ]);

    expect(suggestColumnOrder(pages)).toEqual({
      order: { date: 1, valeur: null, label: 2, debit: 3, credit: null, balance: null },
      headerTokens: ['DATE', 'NATURE', 'DEBIT'],
    });
  });

  it('ignores decoy lines with fewer than 3 distinct keywords', () => {
    const pages = page([
      item('Date du relevé : 02/07/2025', 40, 700),
      item('Solde précédent', 40, 680),
      item('10/06/26', 40, 630),
    ]);

    expect(suggestColumnOrder(pages)).toBeNull();
  });

  it('counts DISTINCT keys: duplicated aliases on one line do not qualify', () => {
    const pages = page([item('Date', 40, 650), item('date', 90, 650), item('valeur', 140, 650)]);

    expect(suggestColumnOrder(pages)).toBeNull();
  });
});

describe('validateColumnOrder', () => {
  it('accepts a minimal valid order', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 2,
        debit: 3,
        credit: null,
        balance: null,
      }),
    ).toBe(true);
  });

  it('rejects a missing amount column', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 2,
        debit: null,
        credit: null,
        balance: null,
      }),
    ).toBe(false);
  });

  it('rejects duplicate positions', () => {
    expect(
      validateColumnOrder({
        date: 1,
        valeur: null,
        label: 1,
        debit: 2,
        credit: null,
        balance: null,
      }),
    ).toBe(false);
  });
});
