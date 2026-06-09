import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  parseDateStr,
  parseValeurDate,
} from '../../../../src/main/import/pdf/extractTransactions';

describe('parseAmount', () => {
  it('parses French number with space thousands separator', () => {
    expect(parseAmount('1 234,56')).toBeCloseTo(1234.56, 2);
  });
  it('parses simple decimal amount', () => {
    expect(parseAmount('37,91')).toBeCloseTo(37.91, 2);
  });
  it('parses large amount', () => {
    expect(parseAmount('2 311,24')).toBeCloseTo(2311.24, 2);
  });
  it('returns null for stray period', () => {
    expect(parseAmount('.')).toBeNull();
  });
  it('returns null for non-numeric text', () => {
    expect(parseAmount('EUR')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });

  // Non-LCL locale formats (regression: dot-thousands used to parse 1000x wrong).
  it('parses dot-thousands with comma decimal (1.234,56)', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56, 2);
  });
  it('parses multi-group dot-thousands (1.234.567,89)', () => {
    expect(parseAmount('1.234.567,89')).toBeCloseTo(1234567.89, 2);
  });
  it('parses anglo grouping (1,234.56)', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56, 2);
  });
  it('treats a single dot before three digits as a thousands group (1.234)', () => {
    expect(parseAmount('1.234')).toBeCloseTo(1234, 2);
  });
  it('treats a single dot before two digits as a decimal (12.34)', () => {
    expect(parseAmount('12.34')).toBeCloseTo(12.34, 2);
  });
  it('parses a trailing-minus amount as negative (12,34-)', () => {
    expect(parseAmount('12,34-')).toBeCloseTo(-12.34, 2);
  });
  it('parses a leading-minus amount as negative (-1 234,56)', () => {
    expect(parseAmount('-1 234,56')).toBeCloseTo(-1234.56, 2);
  });
  it('parses a parenthesised amount as negative ((1 234,56))', () => {
    expect(parseAmount('(1 234,56)')).toBeCloseTo(-1234.56, 2);
  });
  it('strips a currency symbol', () => {
    expect(parseAmount('1 234,56 €')).toBeCloseTo(1234.56, 2);
  });
  it('rejects trailing garbage instead of silently truncating (12ABC)', () => {
    expect(parseAmount('12ABC')).toBeNull();
  });
  it('rejects a lone sign', () => {
    expect(parseAmount('-')).toBeNull();
  });
});

describe('parseDateStr', () => {
  it('converts DD.MM + year to ISO date', () => {
    expect(parseDateStr('01.11', 2025)).toBe('2025-11-01');
  });
  it('handles end-of-month dates', () => {
    expect(parseDateStr('31.10', 2025)).toBe('2025-10-31');
  });
});

describe('parseValeurDate', () => {
  it('converts DD.MM.YY to ISO date', () => {
    expect(parseValeurDate('01.11.25')).toBe('2025-11-01');
    expect(parseValeurDate('02.12.25')).toBe('2025-12-02');
  });
});
