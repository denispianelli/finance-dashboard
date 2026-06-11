import type { ColumnOrder } from '@shared/types/bank';
import type { PdfPage, PdfTextItem } from './extract';

export type { ColumnOrder };

// Accent-stripped, lowercased header words → canonical key. Same vocabulary the
// LLM prompt used to tolerate; now it powers the deterministic suggestion.
const KEY_ALIASES: Record<string, keyof ColumnOrder> = {
  date: 'date',
  valeur: 'valeur',
  value: 'valeur',
  label: 'label',
  libelle: 'label',
  nature: 'label',
  debit: 'debit',
  credit: 'credit',
  balance: 'balance',
  solde: 'balance',
};

function normalizeKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Same-line grouping tolerance: pdfjs y jitters by fractions of a point. */
const Y_TOLERANCE = 2;

/** A header cell longer than this is prose, not a column title. */
const MAX_HEADER_CELL = 30;

/**
 * Canonical key for a header token. Exact alias first; then multi-word cells
 * (pdfjs emits « Nature de l'opération » as ONE token) match on their first
 * word — but only when the cell is digit-free (dates/amounts are data, not
 * header vocabulary) and short enough to be a column title.
 */
function matchHeaderKey(str: string): keyof ColumnOrder | undefined {
  const n = normalizeKey(str);
  const exact = KEY_ALIASES[n];
  if (exact !== undefined) return exact;
  if (/\d/.test(n) || n.length > MAX_HEADER_CELL) return undefined;
  const first = n.split(/\s+/)[0];
  return first === undefined ? undefined : KEY_ALIASES[first];
}

export interface ColumnSuggestion {
  readonly order: ColumnOrder;
  readonly headerTokens: string[];
}

/**
 * Deterministic replacement for the LLM column inference: nearly every French
 * statement has a header line naming its columns. Group items into lines by y,
 * take the first line carrying ≥ 3 DISTINCT canonical keys, and number the
 * matches left-to-right. Null when no line qualifies — the assistant then lets
 * the user compose the order manually.
 */
export function suggestColumnOrder(pages: readonly PdfPage[]): ColumnSuggestion | null {
  for (const p of pages) {
    const lines = groupByLine(p.items);
    for (const line of lines) {
      const matches: { key: keyof ColumnOrder; token: PdfTextItem }[] = [];
      for (const token of line) {
        const key = matchHeaderKey(token.str);
        if (key !== undefined && !matches.some((m) => m.key === key)) {
          matches.push({ key, token });
        }
      }
      if (matches.length < 3) continue;

      matches.sort((a, b) => a.token.x - b.token.x);
      const order: ColumnOrder = {
        date: 0,
        valeur: null,
        label: 0,
        debit: null,
        credit: null,
        balance: null,
      };
      matches.forEach((m, i) => {
        order[m.key] = i + 1;
      });
      if (!validateColumnOrder(order)) continue;
      return { order, headerTokens: matches.map((m) => m.token.str) };
    }
  }
  return null;
}

/** Lines = items sharing a y within tolerance, top-to-bottom, left-to-right. */
function groupByLine(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;
  for (const it of sorted) {
    if (currentY === null || Math.abs(it.y - currentY) <= Y_TOLERANCE) {
      current.push(it);
      currentY ??= it.y;
    } else {
      lines.push(current);
      current = [it];
      currentY = it.y;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * A usable order: date + label present, at least one amount column, and no two
 * present columns sharing a position. Shared rule for the assistant (client) and
 * the banks:learn handler (server).
 */
export function validateColumnOrder(order: ColumnOrder): boolean {
  if (order.date < 1 || order.label < 1) return false;
  if (order.debit === null && order.credit === null) return false;
  const positions = [
    order.date,
    order.valeur,
    order.label,
    order.debit,
    order.credit,
    order.balance,
  ].filter((n): n is number => n !== null);
  if (positions.some((n) => n < 1 || !Number.isInteger(n))) return false;
  return new Set(positions).size === positions.length;
}
