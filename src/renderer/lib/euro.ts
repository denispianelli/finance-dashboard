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

/**
 * "8 421 €" — whole-euro grouping with no decimals, for glance figures
 * (account filter cards, the Entrées/Sorties header totals). The to-the-cent
 * values stay available in the row amounts and the footer net.
 */
export function formatEuroRounded(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}${NBSP}€`;
}

/** "+ 1 234,56 €" / "− 1 234,56 €" — explicit spaced sign (U+2212) + euro. */
export function formatSignedEuro(amount: number): string {
  const sign = amount >= 0 ? '+' : MINUS;
  return `${sign}${NBSP}${formatEuro(Math.abs(amount))}`;
}

/** Compact magnitude for tight spots like donut centres: "38k" for ≥ 1 000
 *  (rounded to the nearest thousand), otherwise the rounded integer. No symbol. */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : '';
  return abs >= 1000
    ? `${sign}${String(Math.round(abs / 1000))}k`
    : `${sign}${String(Math.round(abs))}`;
}

/** Format a 0..1 fraction as a French percentage, e.g. 0.625 → "62,5 %".
 *  Uses Number.prototype.toLocaleString (not `new Intl.NumberFormat`, which is lint-blocked). */
export function formatPercent(fraction: number, maxDigits = 1): string {
  const pct = (fraction * 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
  return `${pct}${NBSP}%`; // non-breaking space (U+00A0) before %
}
