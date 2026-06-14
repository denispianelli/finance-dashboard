import { describe, it, expect } from 'vitest';
import { parseLclAmortization } from '../../../src/main/patrimoine/parseLclAmortization';

// Synthetic 1.00%/3-month loan of 3 000,00 €, insurance 1,00/mo. Fake figures.
const LINES = [
  'INTITULE DU PRET : PRET SYNTHETIQUE DE TEST',
  "MONTANT DU PRET : EUR 3 000,00 PERCEPTION D'INTERETS : A TERME ECHU",
  'DUREE TOTALE DU PRET : 3 MOIS TYPE DE TAUX EN COURS : FIXE',
  'DATE DE DEPART DU PRET : 07.09.2016 TAUX DEBITEUR EN COURS : 1,000000 %',
  'N° DATE AMORTISSEMENT INTERETS ASSURANCE FRAIS MONTANT CAPITAL',
  '001 05/06/2018 997,50 2,50 1,00 0,00 1 001,00 2 002,50',
  '002 05/07/2018 998,33 1,67 1,00 0,00 1 001,00 1 004,17',
  '003 05/08/2018 1 004,17 0,83 1,00 0,00 1 006,00 0,00',
  'TOTAL 3 000,00 5,00 3,00 0,00',
];

describe('parseLclAmortization', () => {
  it('reads the header fields', () => {
    const t = parseLclAmortization(LINES);
    expect(t.name).toBe('PRET SYNTHETIQUE DE TEST');
    expect(t.principal).toBe(3000);
    expect(t.nominalRate).toBe(1);
    expect(t.termMonths).toBe(3);
    expect(t.startDate).toBe('2016-09-07');
  });

  it('reads installments with seq, iso date and the six amounts', () => {
    const t = parseLclAmortization(LINES);
    expect(t.installments).toHaveLength(3);
    expect(t.installments[0]).toEqual({
      seq: 1,
      dueDate: '2018-06-05',
      capital: 997.5,
      interest: 2.5,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 2002.5,
    });
    expect(t.installments[2]?.balanceAfter).toBe(0);
  });

  it('every row satisfies payment = capital + interest + insurance + fees (to the cent)', () => {
    const t = parseLclAmortization(LINES);
    for (const i of t.installments) {
      expect(Math.round((i.capital + i.interest + i.insurance + i.fees) * 100) / 100).toBe(
        i.payment,
      );
    }
  });

  it('totals match the sum of installments (self-check)', () => {
    const t = parseLclAmortization(LINES);
    const sum = (k: 'capital' | 'interest' | 'insurance') =>
      Math.round(t.installments.reduce((s, i) => s + i[k], 0) * 100) / 100;
    expect(sum('capital')).toBe(t.totals.capital);
    expect(sum('interest')).toBe(t.totals.interest);
    expect(sum('insurance')).toBe(t.totals.insurance);
  });

  it('throws on an unrecognized document (no installment rows)', () => {
    expect(() => parseLclAmortization(['random text', 'no rows here'])).toThrow();
  });
});
