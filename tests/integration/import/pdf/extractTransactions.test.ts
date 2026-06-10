import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../../src/main/import/pdf/extract';
import { extractTransactions } from '../../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../../src/main/import/pdf/extractTransactions';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

const LCL_MAPPING: ColumnMapping = {
  date_col: 42,
  label_col: 75,
  debit_col: 433,
  credit_col: 504,
  balance_col: null,
};

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
      expect(first?.label).toMatch(/^VIR\.PERMANENT /);
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
