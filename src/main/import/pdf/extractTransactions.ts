import type { PdfPage, PdfTextItem } from './extract';

export interface ColumnMapping {
  date_col: number;
  label_col: number;
  debit_col: number;
  credit_col: number;
  balance_col: number | null;
}

export interface ExtractedTransaction {
  date: string;
  label: string;
  amount: number; // positive = credit, negative = debit
}

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  openingBalance: number | null;
  closingBalance: number | null;
  openingDate: string;
  closingDate: string;
}

export function parseAmount(str: string): number | null {
  const cleaned = str.replace(/\s/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function parseDateStr(ddmm: string, year: number): string {
  const parts = ddmm.split('.');
  const day = parts[0] ?? '';
  const month = parts[1] ?? '';
  return `${String(year)}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function yyToFullYear(yy: number): number {
  return yy <= 50 ? 2000 + yy : 1900 + yy;
}

export function parseValeurDate(str: string): string {
  const parts = str.split('.');
  const day = parts[0] ?? '';
  const month = parts[1] ?? '';
  const yy = parts[2] ?? '0';
  const fullYear = yyToFullYear(parseInt(yy, 10));
  return `${String(fullYear)}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Generic date token: dd/mm or dd.mm, optional /yy(yy) or .yy(yy).
// Covers LCL (03.02, 03.02.26) and other banks (10/06/10, 09/03/2011).
const DATE_TOKEN = /^(\d{2})[./](\d{2})(?:[./](\d{2,4}))?$/;

function isDateToken(s: string): boolean {
  return DATE_TOKEN.test(s.trim());
}

function hasYear(s: string): boolean {
  return DATE_TOKEN.exec(s.trim())?.[3] !== undefined;
}

/** Parse any supported date token to ISO. Uses the token's own year if present,
 *  else `fallbackYear`. Returns null if not a date token. */
function parseDate(token: string, fallbackYear: number): string | null {
  const m = DATE_TOKEN.exec(token.trim());
  if (m === null) return null;
  const dd = m[1] ?? '';
  const mm = m[2] ?? '';
  const yy = m[3];
  const year =
    yy === undefined
      ? fallbackYear
      : yy.length <= 2
        ? yyToFullYear(parseInt(yy, 10))
        : parseInt(yy, 10);
  return `${String(year)}-${mm}-${dd}`;
}

function inferYear(items: PdfTextItem[]): number {
  for (const item of items) {
    if (hasYear(item.str)) {
      const m = DATE_TOKEN.exec(item.str.trim());
      const yy = m?.[3];
      if (yy !== undefined)
        return yy.length <= 2 ? yyToFullYear(parseInt(yy, 10)) : parseInt(yy, 10);
    }
  }
  return new Date().getFullYear();
}

function normalizeMarker(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
}

const OPENING_MARKER = /ANCIEN SOLDE|SOLDE PRECEDENT/;
const CLOSING_MARKER = /SOLDE EN EUROS|NOUVEAU SOLDE/;

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Y of the transaction-table header row. Requires Date + Débit + Crédit column
 *  titles on the same row, so stray "débit"/"crédit" words in legal prose (other
 *  pages) don't get mistaken for a header. Null if there is no such row. */
function findHeaderY(items: PdfTextItem[]): number | null {
  for (const d of items) {
    if (fold(d.str) !== 'debit') continue;
    const sameRow = new Set(items.filter((i) => Math.abs(i.y - d.y) <= 5).map((i) => fold(i.str)));
    if (sameRow.has('credit') && sameRow.has('date')) return d.y;
  }
  return null;
}

/** Tokens inside the transaction table (below the Débit/Crédit header), so column
 *  derivation isn't polluted by header/footer/legal-text dates and amounts. Falls
 *  back to all tokens when no header is found (layouts without one, e.g. LCL). */
export function tableRegionItems(pages: readonly PdfPage[]): PdfTextItem[] {
  const headers = pages.map((p) => findHeaderY(p.items));
  if (!headers.some((h) => h !== null)) return pages.flatMap((p) => p.items);
  const out: PdfTextItem[] = [];
  pages.forEach((p, i) => {
    const hy = headers[i];
    if (hy === null || hy === undefined) return;
    out.push(...p.items.filter((it) => it.y < hy));
  });
  return out;
}

function groupItemsByY(items: PdfTextItem[], tolerance = 4): PdfTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const firstItem = sorted[0];
  if (!firstItem) return [];
  const groups: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [firstItem];
  let currentY = firstItem.y;
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (!item) continue;
    if (Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
    } else {
      groups.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      currentY = item.y;
    }
  }
  groups.push(current.sort((a, b) => a.x - b.x));
  return groups;
}

export function extractTransactions(pages: PdfPage[], mapping: ColumnMapping): ExtractionResult {
  const year = inferYear(pages.flatMap((p) => p.items));

  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let openingDate = '';
  let closingDate = '';
  const transactions: ExtractedTransaction[] = [];

  for (const page of pages) {
    const rows = groupItemsByY(page.items);

    for (const row of rows) {
      // The transaction date: prefer a date token that carries a year (LCL's
      // "valeur" date), else the leftmost bare date with the inferred year.
      const dateItems = row.filter((i) => isDateToken(i.str));
      // A real transaction row carries its date in the date column (left of the
      // labels); this rejects header rows and dates embedded in footer / legal
      // prose (their dates are mid-line, not in the date column), so multi-page
      // statements work without needing a repeated header on every page.
      if (!dateItems.some((i) => i.x < mapping.label_col)) continue;
      const dateItem = dateItems.find((i) => hasYear(i.str)) ?? dateItems[0];
      if (!dateItem) continue;
      const date = parseDate(dateItem.str, year);
      if (date === null) continue;

      const labelItems = row.filter(
        (i) =>
          i.x >= mapping.label_col - 1 &&
          i.x < mapping.debit_col &&
          i.str.trim().length > 0 &&
          !isDateToken(i.str),
      );
      const debitItems = row.filter((i) => i.x >= mapping.debit_col && i.x < mapping.credit_col);
      const creditItems = row.filter((i) => i.x >= mapping.credit_col);

      const labelStr = labelItems
        .map((i) => i.str.trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      const marker = normalizeMarker(labelStr);

      if (OPENING_MARKER.test(marker)) {
        openingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? null;
        openingDate = date;
        continue;
      }
      if (CLOSING_MARKER.test(marker)) {
        closingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? null;
        closingDate = date;
        continue;
      }
      // Any other balance line (intermediate "SOLDE", page totals) is not a
      // transaction — skip it rather than mis-counting it.
      if (marker.includes('SOLDE')) continue;

      const debitAmt = debitItems.map((i) => parseAmount(i.str)).find((n) => n !== null);
      const creditAmt = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null);

      if (debitAmt == null && creditAmt == null) continue;

      transactions.push({
        date,
        label: labelStr,
        amount: debitAmt != null ? -debitAmt : (creditAmt ?? 0),
      });
    }
  }

  return { transactions, openingBalance, closingBalance, openingDate, closingDate };
}
