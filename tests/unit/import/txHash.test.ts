import { describe, it, expect } from 'vitest';
import { normalizeLabel, computeTxHash } from '../../../src/main/import/txHash';

describe('normalizeLabel', () => {
  it('removes accents', () => {
    expect(normalizeLabel('Crédit Lyonnais')).toBe('CREDIT LYONNAIS');
  });
  it('uppercases', () => {
    expect(normalizeLabel('carrefour')).toBe('CARREFOUR');
  });
  it('collapses spaces, tabs and newlines to a single space', () => {
    expect(normalizeLabel('A  \t B\nC')).toBe('A B C');
  });
  it('trims leading and trailing whitespace', () => {
    expect(normalizeLabel('  VIR SEPA  ')).toBe('VIR SEPA');
  });
  it('handles combined accents, mixed whitespace and surrounding spaces', () => {
    expect(normalizeLabel('  Crédit  \t Lyonnais  ')).toBe('CREDIT LYONNAIS');
  });
});

describe('computeTxHash', () => {
  it('is deterministic for identical inputs', () => {
    const a = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    const b = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    expect(a).toBe(b);
  });
  it('returns a 64-char hex SHA-256 string', () => {
    const h = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('canonicalizes amount: 1.1 and 1.100000001 hash the same', () => {
    expect(computeTxHash('a', '2025-01-01', 1.1, 'X', 0)).toBe(
      computeTxHash('a', '2025-01-01', 1.100000001, 'X', 0),
    );
  });
  it('normalizes the label before hashing', () => {
    expect(computeTxHash('a', '2025-01-01', 10, 'Crédit', 0)).toBe(
      computeTxHash('a', '2025-01-01', 10, 'CREDIT', 0),
    );
  });
  it('changes when any field changes', () => {
    const base = computeTxHash('a', '2025-01-01', 10, 'X', 0);
    expect(computeTxHash('b', '2025-01-01', 10, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-02', 10, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 11, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 10, 'Y', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 10, 'X', 1)).not.toBe(base);
  });
});
