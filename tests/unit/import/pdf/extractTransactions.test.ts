import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../../src/main/import/pdf/extract';
import {
  extractTransactions,
  parseAmount,
  parseDateStr,
  parseValeurDate,
} from '../../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../../src/main/import/pdf/extractTransactions';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

const LCL_MAPPING: ColumnMapping = {
  date_col: 42,
  label_col: 75,
  debit_col: 433,
  credit_col: 504,
  balance_col: null,
};

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

describe('extractTransactions', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts 46 transactions with correct balances from real LCL fixture',
    async () => {
      const buffer = readFileSync(FIXTURE_PATH);
      const { pages } = await extractPdfText(buffer);
      const result = extractTransactions(pages, LCL_MAPPING);

      expect(result.transactions).toHaveLength(46);
      expect(result.openingBalance).not.toBeNull();
      expect(result.openingBalance).toBeCloseTo(2638.2, 2);
      expect(result.closingBalance).not.toBeNull();
      expect(result.closingBalance).toBeCloseTo(1173.71, 2);
      expect(result.openingDate).toBe('2025-10-31');
      expect(result.closingDate).toBe('2025-12-02');

      const first = result.transactions[0];
      expect(first).toBeDefined();
      expect(first?.date).toBe('2025-11-01');
      expect(first?.label).toBe('VIR.PERMANENT MR PIANELLI OU ML');
      expect(first?.amount).toBeCloseTo(-1000.0, 2);

      // Arithmetic: opening + net = closing
      const net = result.transactions.reduce((sum, t) => sum + t.amount, 0);
      const { openingBalance, closingBalance } = result;
      if (openingBalance !== null && closingBalance !== null) {
        expect(openingBalance + net).toBeCloseTo(closingBalance, 1);
      }

      // All transactions have valid ISO dates and non-empty labels
      for (const tx of result.transactions) {
        expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(tx.label.length).toBeGreaterThan(0);
      }
    },
  );
});
