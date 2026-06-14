// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { periodTotals, topCategories } from '../../../src/renderer/lib/reports';
import type { DashboardTransaction } from '@shared/types/dashboard';

function base(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 't',
    accountId: 'a',
    date: '2026-01-05',
    amount: -948.56,
    labelRaw: 'PRET',
    labelClean: 'PRET',
    categoryId: 'cat-logement',
    categoryName: 'Logement',
    categoryColor: '#888',
    categoryIcon: 'home',
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    loanSplit: null,
    ...over,
  };
}

describe('reports with a matched loan payment', () => {
  it('counts only interest+insurance as expense, not the full debit', () => {
    const matched = base({ id: 'm', loanSplit: { interestInsurance: 263.13, capital: 685.43 } });
    const { expense } = periodTotals([matched]);
    expect(expense).toBeCloseTo(-263.13, 2); // not -948.56
  });

  it("attributes the interest to the Intérêts d'emprunt category", () => {
    const matched = base({ id: 'm', loanSplit: { interestInsurance: 263.13, capital: 685.43 } });
    const top = topCategories([matched]);
    expect(top[0]?.name).toBe("Intérêts d'emprunt");
    expect(top[0]?.total).toBeCloseTo(263.13, 2);
  });

  it('is a no-op for unmatched transactions', () => {
    const plain = base({ id: 'p', amount: -20, loanSplit: null });
    expect(periodTotals([plain]).expense).toBeCloseTo(-20, 2);
  });
});
