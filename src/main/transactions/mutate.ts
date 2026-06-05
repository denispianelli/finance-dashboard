import type { DatabaseSync } from 'node:sqlite';
import type { UpdateTransactionInput, DeletedTransactionSnapshot } from '@shared/types/transaction';

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

interface FullRow {
  id: string;
  account_id: string;
  import_id: string | null;
  tx_hash: string;
  date: string;
  amount: number;
  label_raw: string;
  label_clean: string;
  category_id: string | null;
  is_internal_transfer: number;
  user_modified: number;
  fitid: string | null;
  original_date: string | null;
  original_amount: number | null;
  edited_at: string | null;
}

/** Hard-delete a transaction, returning a snapshot of every column so the caller
 *  can restore it (the renderer's undo). Throws if the id does not exist. */
export function deleteTransaction(
  db: DatabaseSync,
  transactionId: string,
): DeletedTransactionSnapshot {
  const row = db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(transactionId) as unknown as FullRow | undefined;
  if (row === undefined) {
    throw new Error(`deleteTransaction: transaction ${transactionId} not found`);
  }
  db.prepare('DELETE FROM transactions WHERE id = ?').run(transactionId);
  return {
    id: row.id,
    accountId: row.account_id,
    importId: row.import_id,
    txHash: row.tx_hash,
    date: row.date,
    amount: row.amount,
    labelRaw: row.label_raw,
    labelClean: row.label_clean,
    categoryId: row.category_id,
    isInternalTransfer: row.is_internal_transfer === 1,
    userModified: row.user_modified === 1,
    fitid: row.fitid,
    originalDate: row.original_date,
    originalAmount: row.original_amount,
    editedAt: row.edited_at,
  };
}

/** Re-insert a previously deleted transaction from its snapshot (undo). */
export function restoreTransaction(db: DatabaseSync, snap: DeletedTransactionSnapshot): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
        category_id, is_internal_transfer, user_modified, fitid,
        original_date, original_amount, edited_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snap.id,
    snap.accountId,
    snap.importId,
    snap.txHash,
    snap.date,
    snap.amount,
    snap.labelRaw,
    snap.labelClean,
    snap.categoryId,
    snap.isInternalTransfer ? 1 : 0,
    snap.userModified ? 1 : 0,
    snap.fitid,
    snap.originalDate,
    snap.originalAmount,
    snap.editedAt,
  );
}
