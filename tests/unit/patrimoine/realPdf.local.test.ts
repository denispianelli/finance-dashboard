import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importLoanFromPdf } from '../../../src/main/patrimoine/importLoan';

const dir = join(process.cwd(), 'spike-fixtures', 'mortgage');
const files = ['pret-A.pdf', 'pret-B.pdf'].map((f) => join(dir, f)).filter(existsSync);

describe.skipIf(files.length === 0)('real LCL PDFs (local only)', () => {
  it.each(files)('parses %s with consistent invariants', async (file) => {
    const res = await importLoanFromPdf(readFileSync(file));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const t = res.parsed;
    expect(t.installments.length).toBeGreaterThan(0);

    let prev = Infinity;
    for (const i of t.installments) {
      expect(Math.round((i.capital + i.interest + i.insurance + i.fees) * 100) / 100).toBe(
        i.payment,
      );
      expect(i.balanceAfter).toBeLessThanOrEqual(prev + 1e-6);
      prev = i.balanceAfter;
    }
    expect(t.installments[t.installments.length - 1]?.balanceAfter).toBe(0);

    const sumCapital = Math.round(t.installments.reduce((s, i) => s + i.capital, 0) * 100) / 100;
    expect(sumCapital).toBe(t.totals.capital);
  });
});
