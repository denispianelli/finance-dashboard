import type { DashboardTransaction } from '@shared/types/dashboard';

/** The seeded category for the interest+insurance part of a loan payment.
 *  Mirrors migration 022 (a test asserts they stay in sync). */
export const INTEREST_LOAN_CATEGORY = {
  id: 'cat-interets-emprunt',
  name: "Intérêts d'emprunt",
  color: '#C58B5C',
} as const;

/**
 * Expand a matched loan payment into the rows the reports should actually count:
 * an "Intérêts d'emprunt" expense (interest+insurance) and a transfer-flagged
 * capital row (neutralized — it builds equity, it is not spending). Unmatched
 * transactions pass through unchanged. The two parts conserve the debit.
 */
export function toAccountingRows(t: DashboardTransaction): DashboardTransaction[] {
  if (t.loanSplit === null) return [t];
  const { interest, insurance, capital } = t.loanSplit;
  return [
    {
      ...t,
      amount: -(Math.round((interest + insurance) * 100) / 100),
      categoryId: INTEREST_LOAN_CATEGORY.id,
      categoryName: INTEREST_LOAN_CATEGORY.name,
      categoryColor: INTEREST_LOAN_CATEGORY.color,
      isInternalTransfer: false,
      loanSplit: null,
    },
    {
      ...t,
      amount: -capital,
      categoryId: 'cat-transferts',
      categoryName: 'Transferts internes',
      isInternalTransfer: true,
      loanSplit: null,
    },
  ];
}
