import { describe, it, expect } from 'vitest';
import { extractTransactions } from '../../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../../src/main/import/pdf/extractTransactions';
import type { PdfPage, PdfTextItem } from '../../../../src/main/import/pdf/extract';

function it_(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: 0 };
}
function page(items: PdfTextItem[]): PdfPage {
  return { pageNumber: 1, items };
}

describe('extractTransactions — LCL layout (dots, valeur date, ANCIEN/EN EUROS)', () => {
  const LCL: ColumnMapping = {
    date_col: 42,
    label_col: 75,
    debit_col: 433,
    credit_col: 504,
    balance_col: null,
  };

  it('extracts transactions and balances, ignoring intermediate SOLDE rows', () => {
    const p = page([
      it_('01.02', 42, 100),
      it_('ANCIEN SOLDE', 80, 100),
      it_('1 000,00', 510, 100),
      it_('03.02', 42, 90),
      it_('03.02.26', 110, 90),
      it_('CARREFOUR', 80, 90),
      it_('12,00', 440, 90),
      it_('05.02', 42, 80),
      it_('05.02.26', 110, 80),
      it_('SALAIRE', 80, 80),
      it_('2 000,00', 510, 80),
      it_('06.02', 42, 75),
      it_('SOLDE INTERMEDIAIRE', 80, 75),
      it_('1 500,00', 510, 75),
      it_('28.02', 42, 70),
      it_('SOLDE EN EUROS', 80, 70),
      it_('2 988,00', 510, 70),
    ]);
    const r = extractTransactions([p], LCL);

    expect(r.transactions).toHaveLength(2);
    // date comes from the year-bearing "valeur" token (LCL behaviour preserved)
    expect(r.transactions[0]).toMatchObject({ date: '2026-02-03', label: 'CARREFOUR' });
    expect(r.transactions[0]?.amount).toBeCloseTo(-12, 2);
    expect(r.transactions[1]).toMatchObject({ date: '2026-02-05', label: 'SALAIRE' });
    expect(r.transactions[1]?.amount).toBeCloseTo(2000, 2);
    expect(r.openingBalance).toBeCloseTo(1000, 2);
    expect(r.openingDate).toBe('2026-02-01');
    expect(r.closingBalance).toBeCloseTo(2988, 2); // not overwritten by the intermediate SOLDE
    expect(r.closingDate).toBe('2026-02-28');
  });
});

describe('extractTransactions — Société Générale layout (slashes, SOLDE PRECEDENT)', () => {
  const SG: ColumnMapping = {
    date_col: 37,
    label_col: 136,
    debit_col: 470,
    credit_col: 527,
    balance_col: null,
  };

  it('extracts transactions from a slash-date statement with two date columns', () => {
    const p = page([
      it_('09/03/11', 37, 100),
      it_('SOLDE PRECEDENT', 136, 100),
      it_('2 543,19', 527, 100),
      it_('10/06/10', 37, 90),
      it_('10/06/10', 87, 90),
      it_('VIR RECU 7141686480', 136, 90),
      it_('109,43', 534, 90),
      it_('11/06/10', 37, 80),
      it_('11/06/10', 87, 80),
      it_('CARREFOURMARKET', 136, 80),
      it_('30,65', 470, 80),
    ]);
    const r = extractTransactions([p], SG);

    expect(r.transactions).toHaveLength(2);
    // operation date (leftmost year-bearing token)
    expect(r.transactions[0]).toMatchObject({ date: '2010-06-10', label: 'VIR RECU 7141686480' });
    expect(r.transactions[0]?.amount).toBeCloseTo(109.43, 2); // credit
    expect(r.transactions[1]).toMatchObject({ date: '2010-06-11', label: 'CARREFOURMARKET' });
    expect(r.transactions[1]?.amount).toBeCloseTo(-30.65, 2); // debit
    expect(r.openingBalance).toBeCloseTo(2543.19, 2);
    expect(r.openingDate).toBe('2011-03-09');
  });

  it('rolls bare dates back a year when the month is past the statement month (Dec→Jan)', () => {
    // Statement closes in January 2026; the opening balance line and the
    // December transaction carry bare dd/mm only. They must land in 2025, not
    // 2026 (regression: a single inferred year put December 11 months ahead).
    const p = page([
      it_('31/12', 37, 100),
      it_('SOLDE PRECEDENT', 136, 100),
      it_('500,00', 527, 100),
      it_('31/12', 37, 90),
      it_('ACHAT DECEMBRE', 136, 90),
      it_('20,00', 470, 90),
      it_('05/01/26', 37, 80), // the only year-bearing token: January 2026
      it_('ACHAT JANVIER', 136, 80),
      it_('10,00', 470, 80),
    ]);
    const r = extractTransactions([p], SG);

    expect(r.openingDate).toBe('2025-12-31');
    expect(r.transactions[0]).toMatchObject({ date: '2025-12-31', label: 'ACHAT DECEMBRE' });
    expect(r.transactions[1]).toMatchObject({ date: '2026-01-05', label: 'ACHAT JANVIER' });
  });

  it('reads an overdrawn (débiteur) balance printed in the debit column as negative', () => {
    const p = page([
      it_('09/03/11', 37, 100),
      it_('SOLDE PRECEDENT', 136, 100),
      it_('123,45', 470, 100), // in the DEBIT column → négatif
    ]);
    const r = extractTransactions([p], SG);
    expect(r.openingBalance).toBeCloseTo(-123.45, 2);
  });

  it('ignores footer/legal rows whose date is not in the date column', () => {
    const p = page([
      it_('10/06/10', 37, 90),
      it_('VIR RECU', 136, 90),
      it_('109,43', 534, 90),
      // footer prose: a date mid-line (x ≥ label_col) + an amount → not a transaction
      it_('01/01/2011', 200, 20),
      it_('Tarif', 150, 20),
      it_('0,34', 534, 20),
    ]);
    const r = extractTransactions([p], SG);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({ label: 'VIR RECU' });
  });
});
