import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyArithmetic } from '../../../src/main/import/verifyArithmetic';
import { extractPdfText } from '../../../src/main/import/pdf/extract';
import { extractTransactions } from '../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../src/main/import/pdf/extractTransactions';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

const LCL_MAPPING: ColumnMapping = {
  date_col: 42,
  label_col: 75,
  debit_col: 433,
  credit_col: 504,
  balance_col: null,
};

describe('verifyArithmetic — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))('passes on the real balanced LCL statement', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const { pages } = await extractPdfText(buffer);
    const result = extractTransactions(pages, LCL_MAPPING);
    const check = verifyArithmetic(
      result.transactions,
      result.openingBalance,
      result.closingBalance,
    );
    expect(check.status).toBe('passed');
    expect(check.delta).toBe(0);
  });

  it.skipIf(!existsSync(FIXTURE_PATH))('fails when the closing balance is falsified', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const { pages } = await extractPdfText(buffer);
    const result = extractTransactions(pages, LCL_MAPPING);
    const tamperedClosing = result.closingBalance === null ? null : result.closingBalance + 10;
    const check = verifyArithmetic(result.transactions, result.openingBalance, tamperedClosing);
    expect(check.status).toBe('failed');
    expect(check.delta).toBeCloseTo(-10, 2);
  });
});
