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
 * date tokens (`dd/mm/yy[yy]`, LCL `dd.mm[.yy]`) and long digit runs (transaction refs)
 * stripped, whitespace collapsed. Used so that assigning Transfert / Remboursement
 * to one transaction can flow to all similar ones (`VIREMENT M DENIS PIANELLI
 * 12/03/25` and `… 14/05/25` share the key `VIREMENT M DENIS PIANELLI`).
 *
 * If stripping leaves no significant token (length ≥ 4, not generic bank
 * vocabulary), the full uppercased label is returned instead — so a label that is
 * only a reference number stays specific and never over-matches.
 */
export function stableLabelKey(label: string): string {
  const stripped = label
    .toUpperCase()
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasSignificant = stripped.split(' ').some((t) => t.length >= 4 && !KEY_STOPWORDS.has(t));

  return hasSignificant ? stripped : label.toUpperCase().replace(/\s+/g, ' ').trim();
}
