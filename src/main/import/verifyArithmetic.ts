import type { ExtractedTransaction } from './pdf/extractTransactions';
import type { ArithmeticCheckResult } from '@shared/types/import';

export type { ArithmeticCheckResult };

export function verifyArithmetic(
  transactions: ExtractedTransaction[],
  openingBalance: number | null,
  closingBalance: number | null,
): ArithmeticCheckResult {
  if (openingBalance === null || closingBalance === null) {
    return {
      status: 'cannot_verify',
      openingBalance,
      closingBalance,
      computedClosing: null,
      delta: null,
    };
  }

  const openingCents = Math.round(openingBalance * 100);
  const sumCents = transactions.reduce((acc, t) => acc + Math.round(t.amount * 100), 0);
  const computedClosingCents = openingCents + sumCents;
  const deltaCents = computedClosingCents - Math.round(closingBalance * 100);

  return {
    status: deltaCents === 0 ? 'passed' : 'failed',
    openingBalance,
    closingBalance,
    computedClosing: computedClosingCents / 100,
    delta: deltaCents / 100,
  };
}
