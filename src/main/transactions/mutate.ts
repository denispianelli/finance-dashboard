import type { DatabaseSync } from 'node:sqlite';
import type { UpdateTransactionInput } from '@shared/types/transaction';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface EditableRow {
  date: string;
  amount: number;
  label_clean: string;
  original_date: string | null;
  original_amount: number | null;
}

/**
 * Edit a transaction's date / label / amount. Figures (date, amount) are
 * snapshotted into original_* the first time they change, so the extracted
 * value is never lost (see ADR-012). Any edit sets edited_at + user_modified.
 * label edits change label_clean only; label_raw is never touched.
 */
export function updateTransaction(db: DatabaseSync, input: UpdateTransactionInput): void {
  if (input.date !== undefined && !ISO_DATE.test(input.date)) {
    throw new Error(`updateTransaction: invalid date "${input.date}"`);
  }
  if (input.amount !== undefined && !Number.isFinite(input.amount)) {
    throw new Error('updateTransaction: amount must be a finite number');
  }
  if (input.label?.trim() === '') {
    throw new Error('updateTransaction: label is empty');
  }

  const row = db
    .prepare(
      'SELECT date, amount, label_clean, original_date, original_amount FROM transactions WHERE id = ?',
    )
    .get(input.transactionId) as unknown as EditableRow | undefined;
  if (row === undefined) {
    throw new Error(`updateTransaction: transaction ${input.transactionId} not found`);
  }

  const nextDate = input.date ?? row.date;
  const nextAmount = input.amount ?? row.amount;
  const nextLabel = input.label !== undefined ? input.label.trim() : row.label_clean;

  const dateChanged = nextDate !== row.date;
  const amountChanged = nextAmount !== row.amount;
  const labelChanged = nextLabel !== row.label_clean;
  if (!dateChanged && !amountChanged && !labelChanged) return;

  const originalDate = dateChanged && row.original_date === null ? row.date : row.original_date;
  const originalAmount =
    amountChanged && row.original_amount === null ? row.amount : row.original_amount;

  db.prepare(
    `UPDATE transactions
     SET date = ?, amount = ?, label_clean = ?,
         original_date = ?, original_amount = ?,
         edited_at = datetime('now'), user_modified = 1
     WHERE id = ?`,
  ).run(nextDate, nextAmount, nextLabel, originalDate, originalAmount, input.transactionId);
}
