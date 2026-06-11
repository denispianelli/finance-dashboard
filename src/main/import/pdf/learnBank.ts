import type { DatabaseSync } from 'node:sqlite';
import type { PdfPage } from './extract';
import type { ColumnMapping } from './extractTransactions';
import type { ColumnOrder } from '@shared/types/bank';
import { deriveColumnMapping } from './deriveMapping';
import { tableRegionItems } from './extractTransactions';

export interface LearnedBank {
  readonly bankId: string;
  readonly name: string;
  readonly signature: string;
  readonly mapping: ColumnMapping;
}

/** A URL/id-safe slug for a bank name (accent-stripped). */
export function slugifyBank(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'bank' : slug;
}

/**
 * Derive a bank's x-threshold mapping from a sample statement and the
 * user-confirmed column order (deterministic — the LLM inference is gone,
 * ADR-019 phase 1b). Returns null if the columns can't be located in the
 * table region (the caller surfaces that as invalid_mapping).
 */
export function learnBankMapping(
  pages: readonly PdfPage[],
  order: ColumnOrder,
): ColumnMapping | null {
  // Derive thresholds from the table region only (excludes header/footer noise).
  return deriveColumnMapping(order, tableRegionItems(pages));
}

/**
 * Persist a learned bank + its v1 column mapping so detectBank recognizes the
 * bank's statements on subsequent (deterministic, no-LLM) imports.
 */
export function persistLearnedBank(db: DatabaseSync, bank: LearnedBank): void {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT OR REPLACE INTO banks (id, name, detected_signature) VALUES (?, ?, ?)').run(
      bank.bankId,
      bank.name,
      bank.signature,
    );
    db.prepare(
      `INSERT OR REPLACE INTO bank_column_mappings
         (bank_id, format_version, date_col, label_col, debit_col, credit_col, balance_col)
       VALUES (?, 'v1', ?, ?, ?, ?, ?)`,
    ).run(
      bank.bankId,
      bank.mapping.date_col,
      bank.mapping.label_col,
      bank.mapping.debit_col,
      bank.mapping.credit_col,
      bank.mapping.balance_col,
    );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
