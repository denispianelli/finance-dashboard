import type { DatabaseSync } from 'node:sqlite';
import type { PdfPage } from './pdf/extract';
import type { ColumnMapping } from './pdf/extractTransactions';
import { findHeaderY } from './pdf/extractTransactions';

export interface DetectedBank {
  bankId: string;
  mapping: ColumnMapping;
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Text of the first-page masthead — items above the transaction-table header,
 *  or the whole first page when no header is found (layouts without one, e.g.
 *  LCL). Matching the bank signature here instead of the whole document stops a
 *  transaction label that happens to contain another bank's name (e.g. "VIR
 *  CREDIT LYONNAIS …") from misidentifying the bank. */
function mastheadText(pages: PdfPage[]): string {
  const firstPage = pages[0];
  if (firstPage === undefined) return '';
  const headerY = findHeaderY(firstPage.items);
  const items = headerY === null ? firstPage.items : firstPage.items.filter((i) => i.y > headerY);
  return fold(items.map((i) => i.str).join(' '));
}

export function detectBank(db: DatabaseSync, pages: PdfPage[]): DetectedBank | null {
  const text = mastheadText(pages);
  const banks = db
    .prepare('SELECT id, detected_signature FROM banks WHERE detected_signature IS NOT NULL')
    .all() as unknown as { id: string; detected_signature: string }[];
  for (const bank of banks) {
    if (text.includes(fold(bank.detected_signature))) {
      const mapping = db
        .prepare(
          `SELECT date_col, label_col, debit_col, credit_col, balance_col
           FROM bank_column_mappings
           WHERE bank_id = ? AND format_version = 'v1'`,
        )
        .get(bank.id) as unknown as ColumnMapping | undefined;
      if (mapping) return { bankId: bank.id, mapping };
    }
  }
  return null;
}
