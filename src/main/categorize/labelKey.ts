/** Generic bank-statement words that don't identify a payee on their own. */
const KEY_STOPWORDS = new Set([
  'VIREMENT',
  'VIR',
  'SEPA',
  'PRLV',
  'INST',
  'PERMANENT',
  'CB',
  'CARTE',
  'PAIEMENT',
  'ACHAT',
  'RETRAIT',
]);

/**
 * A stable, propagation-friendly key for a transaction label: uppercased, with
 * every digit-bearing token dropped — dates, transaction refs, original-currency
 * amounts and exchange rates from multi-line card labels are all volatile, and
 * one volatile token breaks key equality. Used so that assigning Transfert /
 * Remboursement to one transaction can flow to all similar ones (`VIREMENT M
 * JEAN DUPONT 12/03/25` and `… 14/05/25` share the key `VIREMENT M JEAN DUPONT`).
 *
 * If stripping leaves no significant token (length ≥ 4, not generic bank
 * vocabulary), the full uppercased label is returned instead — so a label that is
 * only a reference number stays specific and never over-matches.
 */
export function stableLabelKey(label: string): string {
  const stripped = label
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => !/\d/.test(t))
    .join(' ')
    .trim();

  const hasSignificant = stripped.split(' ').some((t) => t.length >= 4 && !KEY_STOPWORDS.has(t));

  return hasSignificant ? stripped : label.toUpperCase().replace(/\s+/g, ' ').trim();
}
