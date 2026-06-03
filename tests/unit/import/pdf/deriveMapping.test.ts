import { describe, it, expect } from 'vitest';
import { deriveColumnMapping } from '../../../../src/main/import/pdf/deriveMapping';
import type { ColumnOrder } from '../../../../src/main/import/pdf/inferColumns';

const SG_ORDER: ColumnOrder = { date: 1, valeur: 2, label: 3, debit: 4, credit: 5, balance: 6 };

// Real token x-positions observed in the Société Générale specimen.
const SG_TOKENS = [
  { str: '10/06/10', x: 37 },
  { str: '10/06/10', x: 87 },
  { str: 'VIR RECU 7141686480', x: 136 },
  { str: '109,43', x: 534 }, // credit
  { str: '10/06/10', x: 37 },
  { str: '10/06/10', x: 87 },
  { str: 'CARREFOURMARKET', x: 136 },
  { str: '30,65', x: 470 }, // debit
  { str: '150,00', x: 466 }, // debit
  { str: '2 543,19', x: 527 }, // opening balance row
];

describe('deriveColumnMapping', () => {
  it('locates SG columns so debit and credit are separated correctly', () => {
    const m = deriveColumnMapping(SG_ORDER, SG_TOKENS);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.date_col).toBe(37);
    expect(m.label_col).toBe(136);
    // debit amounts (466-470) fall in [debit_col, credit_col); credit (534) >= credit_col
    expect(466).toBeGreaterThanOrEqual(m.debit_col);
    expect(470).toBeLessThan(m.credit_col);
    expect(534).toBeGreaterThanOrEqual(m.credit_col);
  });

  it('maps a clean two-column layout (no balance)', () => {
    const order: ColumnOrder = { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null };
    const tokens = [
      { str: '03.02', x: 40 },
      { str: 'CARREFOUR', x: 75 },
      { str: '12,00', x: 430 }, // debit
      { str: '03.02', x: 40 },
      { str: 'SALAIRE', x: 75 },
      { str: '2 000,00', x: 505 }, // credit
    ];
    const m = deriveColumnMapping(order, tokens);
    expect(m).toMatchObject({ date_col: 40, label_col: 75, balance_col: null });
    if (!m) return;
    expect(430).toBeGreaterThanOrEqual(m.debit_col);
    expect(430).toBeLessThan(m.credit_col);
    expect(505).toBeGreaterThanOrEqual(m.credit_col);
  });

  it('returns null when there are no dates or no amounts', () => {
    expect(deriveColumnMapping(SG_ORDER, [{ str: 'hello', x: 10 }])).toBeNull();
    expect(deriveColumnMapping(SG_ORDER, [{ str: '10/06/10', x: 37 }])).toBeNull();
  });

  it('returns null when debit or credit cannot be located', () => {
    // Only one amount cluster → can't place both debit and credit.
    const tokens = [
      { str: '10/06/10', x: 37 },
      { str: 'X', x: 136 },
      { str: '10,00', x: 500 },
    ];
    expect(deriveColumnMapping(SG_ORDER, tokens)).toBeNull();
  });
});
