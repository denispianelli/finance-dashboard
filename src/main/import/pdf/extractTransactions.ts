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
  openingBalance: number;
  closingBalance: number;
  openingDate: string;
  closingDate: string;
}

export function parseAmount(str: string): number | null {
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function parseDateStr(ddmm: string, year: number): string {
  const [day, month] = ddmm.split('.');
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

export function parseValeurDate(str: string): string {
  const [day, month, yy] = str.split('.');
  const fullYear = parseInt(yy!, 10) <= 50 ? 2000 + parseInt(yy!, 10) : 1900 + parseInt(yy!, 10);
  return `${fullYear}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

function inferYear(items: PdfTextItem[]): number {
  for (const item of items) {
    const m = /^\d{2}\.\d{2}\.(\d{2})$/.exec(item.str);
    if (m) {
      const yy = parseInt(m[1]!, 10);
      return yy <= 50 ? 2000 + yy : 1900 + yy;
    }
  }
  return new Date().getFullYear();
}

function groupItemsByY(items: PdfTextItem[], tolerance = 4): PdfTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const groups: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (Math.abs(item.y - current[0]!.y) <= tolerance) {
      current.push(item);
    } else {
      groups.push(current.sort((a, b) => a.x - b.x));
      current = [item];
    }
  }
  groups.push(current.sort((a, b) => a.x - b.x));
  return groups;
}

export function extractTransactions(pages: PdfPage[], mapping: ColumnMapping): ExtractionResult {
  const year = inferYear(pages.flatMap((p) => p.items));

  let openingBalance = 0;
  let closingBalance = 0;
  let openingDate = '';
  let closingDate = '';
  const transactions: ExtractedTransaction[] = [];

  for (const page of pages) {
    const rows = groupItemsByY(page.items);

    for (const row of rows) {
      const dateItem = row.find((i) => /^\d{2}\.\d{2}$/.test(i.str.trim()));

      if (!dateItem) continue;

      const dateStr = dateItem.str.trim();
      const valeurItem = row.find((i) => /^\d{2}\.\d{2}\.\d{2}$/.test(i.str.trim()));
      const date = valeurItem
        ? parseValeurDate(valeurItem.str.trim())
        : parseDateStr(dateStr, year);

      const labelItems = row.filter(
        (i) =>
          i.x >= mapping.label_col - 1 &&
          i.x < mapping.debit_col &&
          i.str.trim().length > 0 &&
          !/^\d{2}\.\d{2}\.\d{2}$/.test(i.str.trim()) &&
          !/^\d{2}\.\d{2}$/.test(i.str.trim()),
      );
      const debitItems = row.filter((i) => i.x >= mapping.debit_col && i.x < mapping.credit_col);
      const creditItems = row.filter((i) => i.x >= mapping.credit_col);

      const labelStr = labelItems
        .map((i) => i.str.trim())
        .filter(Boolean)
        .join(' ')
        .trim();

      if (labelStr.includes('ANCIEN SOLDE')) {
        openingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? 0;
        openingDate = parseDateStr(dateStr, year);
        continue;
      }

      if (/SOLDE EN EUROS/i.test(labelStr)) {
        closingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? 0;
        closingDate = date;
        continue;
      }

      const debitAmt = debitItems.map((i) => parseAmount(i.str)).find((n) => n !== null);
      const creditAmt = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null);

      if (debitAmt == null && creditAmt == null) continue;

      transactions.push({
        date,
        label: labelStr,
        amount: debitAmt != null ? -debitAmt : creditAmt!,
      });
    }
  }

  return { transactions, openingBalance, closingBalance, openingDate, closingDate };
}
