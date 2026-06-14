// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toAccountingRows, INTEREST_LOAN_CATEGORY } from '../../../src/renderer/lib/loanSplit';
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

describe('toAccountingRows', () => {
  it('returns the row unchanged when not a matched loan payment', () => {
    const t = base({});
    expect(toAccountingRows(t)).toEqual([t]);
  });

  it('expands a matched payment into an interest expense + a neutralized capital row', () => {
    const t = base({ loanSplit: { interest: 214.57, insurance: 48.56, capital: 685.43 } });
    const [interest, capital] = toAccountingRows(t);
    expect(interest?.amount).toBe(-263.13);
    expect(interest?.categoryId).toBe(INTEREST_LOAN_CATEGORY.id);
    expect(interest?.categoryName).toBe(INTEREST_LOAN_CATEGORY.name);
    expect(interest?.isInternalTransfer).toBe(false);
    expect(capital?.amount).toBe(-685.43);
    expect(capital?.isInternalTransfer).toBe(true); // neutralized like a transfer
    expect((interest?.amount ?? 0) + (capital?.amount ?? 0)).toBeCloseTo(-948.56, 2);
  });
});
