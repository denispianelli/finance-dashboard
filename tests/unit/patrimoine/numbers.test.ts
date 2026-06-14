import { describe, it, expect } from 'vitest';
import { parseFrAmount, frDateToIso, extractAmounts } from '../../../src/main/patrimoine/numbers';

describe('parseFrAmount', () => {
  it('parses thousands-spaced comma decimals', () => {
    expect(parseFrAmount('151 464,50')).toBe(151464.5);
    expect(parseFrAmount('0,00')).toBe(0);
    expect(parseFrAmount('948,56')).toBe(948.56);
  });
});

describe('frDateToIso', () => {
  it('handles both dot and slash separators', () => {
    expect(frDateToIso('07.09.2016')).toBe('2016-09-07');
    expect(frDateToIso('05/06/2018')).toBe('2018-06-05');
  });
});

describe('extractAmounts', () => {
  it('pulls every monetary token in order, even with thousands spaces', () => {
    expect(extractAmounts('685,43 214,57 48,56 0,00 948,56 150 779,07')).toEqual([
      685.43, 214.57, 48.56, 0, 948.56, 150779.07,
    ]);
  });
});
