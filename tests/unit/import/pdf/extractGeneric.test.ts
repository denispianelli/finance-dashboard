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

describe('extractTransactions — multi-line labels (continuation rows)', () => {
  const LCL: ColumnMapping = {
    date_col: 42,
    label_col: 75,
    debit_col: 433,
    credit_col: 504,
    balance_col: null,
  };

  it('appends continuation lines below a transaction to its label', () => {
    const p = page([
      it_('04.05', 42, 100),
      it_('04.05.26', 366, 100),
      it_('PRLV SEPA LOLIVIER ASSURANCE', 75, 100),
      it_('47,36', 458, 100),
      // continuation rows: indented in the label column, no date, no debit/credit
      it_('ADMIRAL INTERMEDIARY SERVICES', 81, 88),
      it_('REF.CLIENT:bc:34295010', 81, 76),
      // next transaction ends the chain
      it_('05.05', 42, 64),
      it_('05.05.26', 366, 64),
      it_('CB NETFLIX.COM', 75, 64),
      it_('21,99', 458, 64),
    ]);
    const r = extractTransactions([p], LCL);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]?.label).toBe(
      'PRLV SEPA LOLIVIER ASSURANCE ADMIRAL INTERMEDIARY SERVICES',
    );
    expect(r.transactions[1]?.label).toBe('CB NETFLIX.COM');
  });

  it('keeps the amount intact when a continuation row carries mid-row figures', () => {
    const p = page([
      it_('04.05', 42, 100),
      it_('04.05.26', 366, 100),
      it_('CB UBER * EATS PE 30/04/26', 75, 100),
      it_('7,77', 463, 100),
      // city + original-currency figures sit left of the debit column
      it_('AMSTERDAM', 81, 88),
      it_('EUR', 145, 88),
      it_('7,77', 182, 88),
    ]);
    const r = extractTransactions([p], LCL);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.label).toBe('CB UBER * EATS PE 30/04/26 AMSTERDAM EUR 7,77');
    expect(r.transactions[0]?.amount).toBeCloseTo(-7.77, 2);
  });

  it('does not append footer or full-width rows to the previous transaction', () => {
    const p = page([
      it_('07.05', 42, 100),
      it_('07.05.26', 366, 100),
      it_('CB SMYTHS TOYS FR 06/05/26', 75, 100),
      it_('155,99', 453, 100),
      // page footer: left of the label column / right of the debit column
      it_('Credit Lyonnais-SA au capital de 2 037 713 591 euros', 36, 80),
      it_('Page 1 / 4', 524, 60),
    ]);
    const r = extractTransactions([p], LCL);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.label).toBe('CB SMYTHS TOYS FR 06/05/26');
  });

  it('does not attach text following a balance marker row', () => {
    const p = page([
      it_('30.04', 42, 100),
      it_('ANCIEN SOLDE', 286, 100),
      it_('4 934,82', 523, 100),
      it_('Mention sous le solde', 81, 88),
      it_('01.05', 42, 76),
      it_('01.05.26', 366, 76),
      it_('VIR.PERMANENT MR DUPONT', 75, 76),
      it_('1 000,00', 445, 76),
    ]);
    const r = extractTransactions([p], LCL);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.label).toBe('VIR.PERMANENT MR DUPONT');
    expect(r.openingBalance).toBeCloseTo(4934.82, 2);
  });
});

describe('extractTransactions — pure-reference continuation lines', () => {
  const LCL: ColumnMapping = {
    date_col: 42,
    label_col: 75,
    debit_col: 433,
    credit_col: 504,
    balance_col: null,
  };

  it('skips SEPA reference lines but keeps informative continuations', () => {
    const p = page([
      it_('04.05', 42, 100),
      it_('04.05.26', 366, 100),
      it_('PRLV SEPA LOLIVIER ASSURANCE', 75, 100),
      it_('47,36', 458, 100),
      it_('ADMIRAL INTERMEDIARY SERVICES', 81, 88),
      it_('REF.CLIENT:bc:34295010', 81, 76),
      it_('ID.CREANCIER:FR23ZZZ857BC4', 81, 64),
      it_('REF.MANDAT: ADM1080509560-202007262318', 81, 52),
    ]);
    const r = extractTransactions([p], LCL);
    expect(r.transactions[0]?.label).toBe(
      'PRLV SEPA LOLIVIER ASSURANCE ADMIRAL INTERMEDIARY SERVICES',
    );
  });
});
