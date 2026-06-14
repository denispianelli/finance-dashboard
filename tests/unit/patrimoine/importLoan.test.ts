import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: () =>
    Promise.resolve({
      hasText: true,
      pages: [
        {
          pageNumber: 1,
          items: [
            { str: 'INTITULE DU PRET : PRET TEST', x: 10, y: 300, width: 5 },
            { str: 'MONTANT DU PRET : EUR 3 000,00', x: 10, y: 290, width: 5 },
            { str: 'DUREE TOTALE DU PRET : 3 MOIS', x: 10, y: 280, width: 5 },
            { str: 'DATE DE DEPART DU PRET : 07.09.2016', x: 10, y: 270, width: 5 },
            { str: 'TAUX DEBITEUR EN COURS : 1,000000 %', x: 400, y: 270, width: 5 },
            {
              str: '001 05/06/2018 997,50 2,50 1,00 0,00 1 001,00 2 002,50',
              x: 10,
              y: 200,
              width: 5,
            },
            {
              str: '002 05/07/2018 998,33 1,67 1,00 0,00 1 001,00 1 004,17',
              x: 10,
              y: 190,
              width: 5,
            },
            {
              str: '003 05/08/2018 1 004,17 0,83 1,00 0,00 1 006,00 0,00',
              x: 10,
              y: 180,
              width: 5,
            },
          ],
        },
      ],
    }),
}));

const { importLoanFromPdf } = await import('../../../src/main/patrimoine/importLoan');

describe('importLoanFromPdf', () => {
  it('returns a parsed table for a valid LCL PDF buffer', async () => {
    const res = await importLoanFromPdf(Buffer.from('%PDF-1.4 ...'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.parsed.principal).toBe(3000);
      expect(res.parsed.installments).toHaveLength(3);
    }
  });

  it('rejects non-PDF buffers', async () => {
    const res = await importLoanFromPdf(Buffer.from('not a pdf'));
    expect(res).toEqual({ ok: false, error: 'not_pdf' });
  });
});
