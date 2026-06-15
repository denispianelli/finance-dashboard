// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseBourseCsv } from '../../../src/main/investment/parseBourseCsv';

const HEADER =
  "libellé;Opération;Place;Date;Qté;Prix d'éxé;Montant brut;Courtage/Prélèvement;Montant net;Devise;";
const csv = [
  HEADER,
  'WORLD ETF ACC;Achat Comptant;Euronext Paris;05/05/2026;96.0;5.72;-549.12;-2.74;-551.86;EUR;',
  'WORLD ETF ACC;Vente comptant;Euronext Paris;06/06/2026;10;6.00;60.00;-1.00;59.00;EUR;',
  'WORLD ETF ACC;Coupon;Euronext Paris;07/06/2026;0;0;0;0;1.23;EUR;',
  '',
].join('\r\n');

describe('parseBourseCsv', () => {
  it('parses buys/sells and skips unknown operation types', () => {
    const res = parseBourseCsv(csv);
    expect(res.ops).toHaveLength(2);
    const buy = res.ops[0];
    expect(buy?.kind).toBe('buy');
    expect(buy?.opDate).toBe('2026-05-05');
    expect(buy?.quantity).toBe(96);
    expect(buy?.net).toBeCloseTo(-551.86, 2);
    expect(buy?.rawLabel).toBe('WORLD ETF ACC');
    expect(res.ops[1]?.kind).toBe('sell');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]?.reason).toMatch(/type/i);
  });

  it('skips rows with an unreadable date or net amount', () => {
    const bad = [HEADER, 'X;Achat Comptant;P;notadate;1;1;1;0;-1;EUR;'].join('\r\n');
    expect(parseBourseCsv(bad).skipped).toHaveLength(1);
  });
});
