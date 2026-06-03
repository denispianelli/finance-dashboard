import { describe, it, expect } from 'vitest';
import { buildColumnPrompt, parseColumnOrder } from '../../../../src/main/import/pdf/inferColumns';

describe('buildColumnPrompt', () => {
  it('includes the statement text and the required JSON keys', () => {
    const p = buildColumnPrompt('DATE LIBELLE DEBIT CREDIT 12,00');
    expect(p).toContain('date, valeur, label, debit, credit, balance');
    expect(p).toContain('DATE LIBELLE DEBIT CREDIT 12,00');
  });

  it('truncates very long statement text', () => {
    const p = buildColumnPrompt('x'.repeat(20000));
    expect(p.length).toBeLessThan(9000);
  });
});

describe('parseColumnOrder', () => {
  it('parses a clean English-keyed response', () => {
    expect(parseColumnOrder('{"date":1,"valeur":2,"label":3,"debit":4,"credit":5,"balance":6}')).toEqual(
      { date: 1, valeur: 2, label: 3, debit: 4, credit: 5, balance: 6 },
    );
  });

  it('normalizes the French key drift (libellé/solde) the model actually returned', () => {
    // This is the literal response Llama 3.2 3B gave on the Société Générale specimen.
    const r = '{"date":1,"valeur":2,"libellé":3,"debit":4,"credit":5,"solde":6}';
    expect(parseColumnOrder(r)).toEqual({
      date: 1,
      valeur: 2,
      label: 3,
      debit: 4,
      credit: 5,
      balance: 6,
    });
  });

  it('extracts the JSON object from surrounding prose', () => {
    const r = 'Voici le mapping :\n{"date":1,"label":2,"debit":3,"credit":4}\nVoilà.';
    expect(parseColumnOrder(r)).toMatchObject({ date: 1, label: 2, debit: 3, credit: 4 });
  });

  it('accepts numeric strings and explicit nulls', () => {
    expect(parseColumnOrder('{"date":"1","label":"2","credit":"3","debit":null,"balance":null}')).toEqual(
      { date: 1, valeur: null, label: 2, debit: null, credit: 3, balance: null },
    );
  });

  it('defaults missing optional columns to null', () => {
    expect(parseColumnOrder('{"date":1,"label":2,"debit":3,"credit":4}')).toEqual({
      date: 1,
      valeur: null,
      label: 2,
      debit: 3,
      credit: 4,
      balance: null,
    });
  });

  it('returns null when the date or label is missing', () => {
    expect(parseColumnOrder('{"label":2,"debit":3,"credit":4}')).toBeNull();
    expect(parseColumnOrder('{"date":1,"debit":3}')).toBeNull();
  });

  it('returns null when neither debit nor credit is present', () => {
    expect(parseColumnOrder('{"date":1,"label":2,"balance":3}')).toBeNull();
  });

  it('returns null on non-JSON garbage', () => {
    expect(parseColumnOrder('je ne sais pas')).toBeNull();
    expect(parseColumnOrder('{ not json }')).toBeNull();
  });
});
