import { describe, it, expect } from 'vitest';
import { NBSP, MINUS, formatAmount, formatEuro, formatSignedEuro } from '@renderer/lib/euro';

describe('euro constants', () => {
  it('NBSP is U+00A0 and MINUS is U+2212', () => {
    expect(NBSP).toBe(' ');
    expect(MINUS).toBe('−');
  });
});

describe('formatAmount', () => {
  it('groups thousands with two decimals and no symbol', () => {
    expect(formatAmount(1234.5).replace(/\s/g, ' ')).toBe('1 234,50');
    expect(formatAmount(0)).toBe('0,00');
  });
});

describe('formatEuro', () => {
  it('ends with a non-breaking space then €', () => {
    expect(formatEuro(1234.56).replace(/\s/g, ' ')).toBe('1 234,56 €');
    expect(formatEuro(5).endsWith(' €')).toBe(true);
    expect(formatEuro(5).endsWith(' €')).toBe(false); // not a plain space
  });
});

describe('formatSignedEuro', () => {
  it('prefixes a + and a NBSP for non-negative amounts', () => {
    expect(formatSignedEuro(2480).startsWith('+ ')).toBe(true);
    expect(formatSignedEuro(2480).replace(/\s/g, ' ')).toBe('+ 2 480,00 €');
  });
  it('prefixes a true minus (U+2212), never a hyphen, for negative amounts', () => {
    const s = formatSignedEuro(-412.9);
    expect(s.startsWith('− ')).toBe(true);
    expect(s.includes('-')).toBe(false);
    expect(s.replace(/\s/g, ' ')).toBe('− 412,90 €');
  });
});
