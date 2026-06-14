/** A French monetary token: digits with optional thousands spaces, comma decimals. */
const AMOUNT_RE = /\d[\d ]*,\d{2}/g;

/** "151 464,50" -> 151464.5 */
export function parseFrAmount(token: string): number {
  return Number(token.replace(/\s/g, '').replace(',', '.'));
}

/** "07.09.2016" or "05/06/2018" -> "2016-09-07" / "2018-06-05" */
export function frDateToIso(token: string): string {
  const m = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(token.trim());
  if (!m) throw new Error(`bad fr date: ${token}`);
  const [, dd, mm, yyyy] = m;
  if (!dd || !mm || !yyyy) throw new Error(`bad fr date: ${token}`);
  return `${yyyy}-${mm}-${dd}`;
}

/** Every monetary token in a string, left to right, as numbers. */
export function extractAmounts(s: string): number[] {
  return (s.match(AMOUNT_RE) ?? []).map(parseFrAmount);
}
