/**
 * Single source of truth for euro / signed-amount rendering (design drift #1).
 *
 * French formatting throughout: grouped thousands, comma decimal, a
 * **non-breaking space** before `€`, and an explicit, spaced sign using the
 * true minus U+2212 (never a hyphen). Keep every displayed amount on this path
 * so figures format identically across the app.
 */
export const NBSP = ' ';
export const MINUS = '−';

/** "1 234,56" — French grouping, two decimals, no currency symbol. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "1 234,56 €" — amount with a non-breaking space before the symbol. */
export function formatEuro(amount: number): string {
  return `${formatAmount(amount)}${NBSP}€`;
}

/** "+ 1 234,56 €" / "− 1 234,56 €" — explicit spaced sign (U+2212) + euro. */
export function formatSignedEuro(amount: number): string {
  const sign = amount >= 0 ? '+' : MINUS;
  return `${sign}${NBSP}${formatEuro(Math.abs(amount))}`;
}
