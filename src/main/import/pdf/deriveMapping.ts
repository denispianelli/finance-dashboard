import type { ColumnMapping } from './extractTransactions';
import type { ColumnOrder } from './inferColumns';

/** Minimal positioned token (PdfTextItem is structurally compatible). */
export interface PositionedToken {
  readonly str: string;
  readonly x: number;
}

// Dates with `/` or `.` separators, optional year: 10/06, 10/06/10, 03.02.2026…
const DATE_RE = /^\d{2}[./]\d{2}(?:[./]\d{2,4})?$/;
// French amount: 109,43 · 2 543,19 (regular or non-breaking space grouping), optional sign.
const AMOUNT_RE = /^-?\d{1,3}(?:\s\d{3})*,\d{2}$/;

function isDate(s: string): boolean {
  return DATE_RE.test(s.trim());
}
function isAmount(s: string): boolean {
  return AMOUNT_RE.test(s.trim());
}

/** Left edge (min x) of each x-cluster, left→right. A new cluster starts when the
 *  gap to the previous x exceeds `gap`. */
function clusterLeftEdges(xs: number[], gap: number): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const edges: number[] = [];
  let prev: number | undefined;
  for (const x of sorted) {
    if (prev === undefined || x - prev > gap) edges.push(x);
    prev = x;
  }
  return edges;
}

/**
 * Turn the LLM's column ORDER into the x-threshold ColumnMapping the deterministic
 * extractor consumes, using the real token positions:
 *  - amount columns are located by clustering the x of amount tokens, then mapped
 *    to debit/credit/balance left-to-right following the LLM order;
 *  - the date column is the leftmost date token; the label column starts at the
 *    first non-date/non-amount token after the dates.
 *
 * Returns null if it can't locate the essentials (dates + a debit and a credit
 * column) — the caller then treats the bank as unmapped. The arithmetic check
 * downstream is the real safety net against a wrong mapping.
 */
export function deriveColumnMapping(
  order: ColumnOrder,
  tokens: readonly PositionedToken[],
): ColumnMapping | null {
  const dateXs = tokens.filter((t) => isDate(t.str)).map((t) => t.x);
  const amountXs = tokens.filter((t) => isAmount(t.str)).map((t) => t.x);
  if (dateXs.length === 0 || amountXs.length === 0) return null;

  const clusters = clusterLeftEdges(amountXs, 25);
  const firstAmount = clusters[0];
  if (firstAmount === undefined) return null;

  const dateColLeft = Math.min(...dateXs);

  // Label area starts at the first non-date/non-amount token right of the (left)
  // date column and left of the first amount column. Using the LEFT date column
  // as the lower bound makes this robust to a stray footer date at a high x.
  const labelXs = tokens
    .filter(
      (t) =>
        t.str.trim() !== '' &&
        !isDate(t.str) &&
        !isAmount(t.str) &&
        t.x > dateColLeft &&
        t.x < firstAmount,
    )
    .map((t) => t.x);
  const labelCol = labelXs.length > 0 ? Math.min(...labelXs) : dateColLeft + 10;

  // Amount columns the LLM reported, in left-to-right order.
  const amountCols = (['debit', 'credit', 'balance'] as const)
    .filter((c) => order[c] !== null)
    .sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0));

  const assigned: Partial<Record<'debit' | 'credit' | 'balance', number>> = {};
  for (let i = 0; i < Math.min(clusters.length, amountCols.length); i++) {
    const col = amountCols[i];
    const edge = clusters[i];
    if (col !== undefined && edge !== undefined) assigned[col] = edge;
  }

  if (assigned.debit === undefined || assigned.credit === undefined) return null;

  return {
    date_col: dateColLeft,
    label_col: labelCol,
    debit_col: assigned.debit,
    credit_col: assigned.credit,
    balance_col: assigned.balance ?? null,
  };
}
