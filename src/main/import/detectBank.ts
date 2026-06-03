import type { DatabaseSync } from 'node:sqlite';
import type { PdfPage } from './pdf/extract';
import type { ColumnMapping } from './pdf/extractTransactions';

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

export function detectBank(db: DatabaseSync, pages: PdfPage[]): DetectedBank | null {
  const text = fold(pages.map((p) => p.items.map((i) => i.str).join(' ')).join(' '));
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
